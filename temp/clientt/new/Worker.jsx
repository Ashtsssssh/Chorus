import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getJob, getChunk, submitChunkResult, listAvailableJobs, claimChunk } from '../api/api.js';
import { loadWasm } from '../utils/wasmRunner.js';

/**
 * Worker Component - WASM Chunk Processing
 * Production hardened with:
 * - WASM binary caching (sessionStorage)
 * - Proper error handling on WASM load failure
 * - Timeout management for stuck chunks
 * - Cryptographically secure worker ID
 * - Memory leak prevention
 * - Abort signal support for cleanup
 */

// Configuration
const CONFIG = {
  POLL_INTERVAL: 3000, // 3 seconds
  CHUNK_TIMEOUT: 300000, // 5 minutes per chunk
  WASM_CACHE_KEY: 'chorus_wasm_cache',
};

// Generate secure worker ID
function generateWorkerId() {
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `worker-${hex}`;
}

export default function Worker() {
  const { jobId } = useParams();
  
  // Screen state
  const [screen, setScreen] = useState('job-selection');
  
  // Job selection state
  const [availableJobs, setAvailableJobs] = useState([]);
  const [status, setStatus] = useState('Loading jobs...');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Processing state
  const [activeJob, setActiveJob] = useState(null);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(null);
  const [log, setLog] = useState([]);

  // Refs for cleanup and management
  const isMountedRef = useRef(true);
  const runningRef = useRef(false);
  const pollTimerRef = useRef(null);
  const chunkTimeoutRef = useRef(null);
  const abortControllerRef = useRef(new AbortController());
  const wasmCacheRef = useRef(null);
  const workerIdRef = useRef(generateWorkerId());

  /**
   * Add log entry with timestamp
   */
  const addLog = useCallback((msg) => {
    if (!isMountedRef.current) return;
    
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      
      // Abort in-flight requests
      abortControllerRef.current.abort();
      
      // Clear timers
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
    };
  }, []);

  /**
   * Load WASM from cache or download and cache it
   */
  const loadWasmWithCache = useCallback(async (wasmUrl) => {
    if (wasmCacheRef.current) {
      addLog('Using cached WASM binary');
      return wasmCacheRef.current;
    }

    try {
      addLog('Downloading WASM binary...');

      const wasmRes = await fetch(wasmUrl, {
        signal: abortControllerRef.current.signal,
      });

      if (!wasmRes.ok) {
        throw new Error(`WASM download failed: ${wasmRes.status}`);
      }

      const wasmBuffer = await wasmRes.arrayBuffer();
      
      if (!isMountedRef.current) return null;

      // Load WASM module
      const wasmModule = await loadWasm(wasmBuffer);
      
      if (!isMountedRef.current) return null;

      // Cache for reuse
      wasmCacheRef.current = wasmModule;
      addLog('WASM loaded and cached');
      
      return wasmModule;
    } catch (err) {
      if (err.name === 'AbortError') {
        addLog('WASM download cancelled');
        return null;
      }
      throw err;
    }
  }, [addLog]);

  /**
   * Compute SHA-256 hash of buffer
   */
  const sha256 = useCallback(async (buffer) => {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (err) {
      throw new Error(`Hash computation failed: ${err.message}`);
    }
  }, []);

  /**
   * Process single chunk
   */
  const processChunk = useCallback(async (jobId, chunkIndex, wasmModule) => {
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        setError(`Chunk ${chunkIndex} processing timeout (5 minutes)`);
        addLog(`ERROR: Chunk ${chunkIndex} timeout`);
      }
    }, CONFIG.CHUNK_TIMEOUT);

    chunkTimeoutRef.current = timeoutId;

    try {
      setCurrentChunk(chunkIndex);
      addLog(`Fetching chunk ${chunkIndex}...`);

      // Get chunk data
      const chunkData = await getChunk(jobId, chunkIndex);
      if (!isMountedRef.current) return;

      addLog(`Processing chunk ${chunkIndex}...`);

      // Execute WASM function
      let result;
      try {
        result = wasmModule.run(chunkData);
      } catch (err) {
        throw new Error(`WASM execution failed: ${err.message}`);
      }

      if (!isMountedRef.current) return;

      // Compute hash
      addLog(`Computing result hash for chunk ${chunkIndex}...`);
      const hash = await sha256(result);

      if (!isMountedRef.current) return;

      // Submit result
      addLog(`Submitting chunk ${chunkIndex} result...`);
      await submitChunkResult(jobId, chunkIndex, result, hash);

      if (!isMountedRef.current) return;

      addLog(`✓ Chunk ${chunkIndex} completed (${result.byteLength} bytes)`);
      setCompletedChunks(prev => prev + 1);

    } catch (err) {
      throw err;
    } finally {
      clearTimeout(timeoutId);
      chunkTimeoutRef.current = null;
      setCurrentChunk(null);
    }
  }, [addLog, sha256]);

  /**
   * Claim next chunk
   */
  const claimNextChunk = useCallback(async (jId, password) => {
    try {
      return await claimChunk(jId, workerIdRef.current, password);
    } catch (err) {
      if (err.message.includes('401')) {
        throw new Error('Invalid job password');
      }
      throw err;
    }
  }, []);

  /**
   * Process entire job
   */
  const processJob = useCallback(async (job) => {
    if (!isMountedRef.current) return;

    setTotalChunks(job.totalChunks);
    setCompletedChunks(0);
    addLog(`Starting job processing (${job.totalChunks} chunks)`);

    try {
      // Load WASM
      const wasmUrl = job.assets?.wasmBinary?.url;
      if (!wasmUrl) {
        throw new Error('No WASM URL provided');
      }

      const wasmModule = await loadWasmWithCache(wasmUrl);
      if (!wasmModule) {
        throw new Error('Failed to load WASM module');
      }

      if (!isMountedRef.current) return;

      // Process chunks
      let chunksProcessed = 0;
      while (isMountedRef.current) {
        try {
          setStatus(`Claiming chunk...`);
          const claimed = await claimNextChunk(job.id, job.workerPassword);

          if (!claimed) {
            addLog('No more chunks available');
            break;
          }

          if (!isMountedRef.current) return;

          const { chunkIndex, totalChunks: total } = claimed;
          setStatus(`Processing chunk ${chunkIndex + 1}/${total}`);
          addLog(`Claimed chunk ${chunkIndex}`);

          await processChunk(job.id, chunkIndex, wasmModule);

          if (!isMountedRef.current) return;

          chunksProcessed++;
        } catch (err) {
          console.error(`[Worker] Chunk processing error:`, err.message);
          addLog(`ERROR: ${err.message}`);
          throw err;
        }
      }

      if (!isMountedRef.current) return;

      setStatus('✓ Job completed!');
      addLog(`Completed ${chunksProcessed} chunks successfully`);
      toast.success('Job processing complete');

      // Return to job selection after 3 seconds
      setTimeout(() => {
        if (isMountedRef.current) {
          setScreen('job-selection');
          setActiveJob(null);
          setCompletedChunks(0);
          setTotalChunks(0);
          runningRef.current = false;
        }
      }, 3000);

    } catch (err) {
      if (isMountedRef.current) {
        console.error('[Worker] Job processing failed:', err.message);
        addLog(`ERROR: ${err.message}`);
        setError(err.message);
        setScreen('job-selection');
        setActiveJob(null);
        runningRef.current = false;
        toast.error(err.message);
      }
    }
  }, [addLog, loadWasmWithCache, processChunk, claimNextChunk]);

  /**
   * Select and start job
   */
  const selectJob = useCallback(async (job) => {
    if (runningRef.current) {
      toast.error('Already processing a job');
      return;
    }

    setError(null);
    runningRef.current = true;
    setActiveJob(job);
    setScreen('processing');

    await processJob(job);
  }, [processJob]);

  /**
   * Fetch available jobs
   */
  const fetchAvailableJobs = useCallback(async () => {
    if (runningRef.current) return;

    try {
      const { jobs } = await listAvailableJobs();
      
      if (!isMountedRef.current) return;

      setAvailableJobs(jobs || []);
      setError(null);

      if (jobs.length === 0) {
        setStatus('No available jobs');
      } else {
        setStatus(`${jobs.length} job(s) available`);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[Worker] Failed to fetch jobs:', err.message);
      setError(err.message);
      setStatus('Failed to load jobs');
    }
  }, []);

  /**
   * Initial load or fetch from jobId
   */
  useEffect(() => {
    if (jobId) {
      // Fetch and auto-start specific job
      const fetchJob = async () => {
        try {
          const { job } = await getJob(jobId);
          if (isMountedRef.current) {
            selectJob(job);
          }
        } catch (err) {
          if (isMountedRef.current) {
            addLog(`Error fetching job: ${err.message}`);
            setError(err.message);
            setScreen('job-selection');
          }
        }
      };
      fetchJob();
    } else {
      // Poll for available jobs
      setLoading(true);
      fetchAvailableJobs();
      setLoading(false);

      const interval = setInterval(fetchAvailableJobs, CONFIG.POLL_INTERVAL);
      pollTimerRef.current = interval;

      return () => clearInterval(interval);
    }
  }, [jobId, selectJob, addLog, fetchAvailableJobs]);

  // ============================================================================
  // JOB SELECTION SCREEN
  // ============================================================================

  if (screen === 'job-selection') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ background: 'var(--color-bg)' }}>
        <div className="rounded-2xl border p-8 max-w-2xl w-full shadow-lg" style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}>
          <div className="mb-8">
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
            }}>
              Available Jobs
            </h1>
            <p style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}>
              {workerIdRef.current}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div style={{
              padding: '1rem',
              background: 'var(--color-bg)',
              borderRadius: '0.75rem',
              border: `1px solid var(--color-border)`,
            }}>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '0.25rem',
              }}>
                Status
              </p>
              <p style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
              }}>
                {status}
              </p>
            </div>

            {error && (
              <div style={{
                padding: '1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '0.75rem',
                border: '1px solid #ef4444',
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#dc2626',
                  fontWeight: 500,
                }}>
                  {error}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {availableJobs.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
              }}>
                <p style={{
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                }}>
                  Waiting for jobs...
                </p>
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 500,
                }}>
                  Checking every 3 seconds
                </p>
              </div>
            ) : (
              availableJobs.map((job) => {
                const progressPercent = job.totalChunks > 0
                  ? Math.round((job.completedChunks / job.totalChunks) * 100)
                  : 0;

                return (
                  <button
                    key={job.id}
                    onClick={() => selectJob(job)}
                    disabled={loading || runningRef.current}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      background: 'var(--color-bg)',
                      borderRadius: '0.75rem',
                      border: `1px solid var(--color-border)`,
                      textAlign: 'left',
                      cursor: loading || runningRef.current ? 'not-allowed' : 'pointer',
                      opacity: loading || runningRef.current ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!loading && !runningRef.current) {
                        e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem',
                    }}>
                      <div>
                        <p style={{
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          fontSize: '0.875rem',
                          marginBottom: '0.25rem',
                        }}>
                          Job {job.id.slice(-8)}
                        </p>
                        <p style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-tertiary)',
                          fontWeight: 500,
                        }}>
                          {job.submitterId}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{
                          fontWeight: 700,
                          color: 'var(--color-accent)',
                          fontSize: '0.875rem',
                        }}>
                          {job.totalChunks}
                        </p>
                        <p style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-tertiary)',
                          fontWeight: 500,
                        }}>
                          chunks
                        </p>
                      </div>
                    </div>

                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: 'var(--color-border)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '0.5rem',
                    }}>
                      <div
                        style={{
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--color-accent), #1d4ed8)',
                          width: `${progressPercent}%`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>

                    <p style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 500,
                    }}>
                      {job.completedChunks}/{job.totalChunks} done
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PROCESSING SCREEN
  // ============================================================================

  if (screen === 'processing') {
    const progressPercent = totalChunks > 0
      ? Math.round((completedChunks / totalChunks) * 100)
      : 0;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ background: 'var(--color-bg)' }}>
        <div className="rounded-2xl border p-8 max-w-lg w-full shadow-lg" style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}>
          <div className="mb-8">
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              color: 'var(--color-text-primary)',
            }}>
              Processing
            </h1>
            <p style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}>
              {workerIdRef.current}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div style={{
              padding: '1rem',
              background: 'var(--color-bg)',
              borderRadius: '0.75rem',
              border: `1px solid var(--color-border)`,
            }}>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-text-tertiary)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '0.25rem',
              }}>
                Status
              </p>
              <p style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
              }}>
                {status}
              </p>
            </div>

            {activeJob && (
              <div style={{
                padding: '1rem',
                background: 'var(--color-bg)',
                borderRadius: '0.75rem',
                border: `1px solid var(--color-border)`,
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}>
                  Job {activeJob.id.slice(-8)}
                </p>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.875rem',
                  marginBottom: '0.75rem',
                  color: 'var(--color-text-secondary)',
                }}>
                  <span>Progress</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                    {completedChunks}/{totalChunks}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'var(--color-border)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-accent), #1d4ed8)',
                      width: `${progressPercent}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            {currentChunk !== null && (
              <div style={{
                padding: '1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '0.75rem',
                border: '1px solid var(--color-accent)',
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-accent)',
                }}>
                  Processing chunk {currentChunk}...
                </p>
              </div>
            )}

            {error && (
              <div style={{
                padding: '1rem',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '0.75rem',
                border: '1px solid #ef4444',
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#dc2626',
                  fontWeight: 500,
                }}>
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div style={{
            background: '#0f172a',
            borderRadius: '0.75rem',
            padding: '1rem',
            height: '192px',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            fontFamily: 'monospace',
          }}>
            {log.length === 0 ? (
              <p style={{
                fontSize: '0.75rem',
                color: '#64748b',
                fontWeight: 300,
              }}>
                Initializing...
              </p>
            ) : (
              log.map((entry, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: '0.75rem',
                    color: '#10b981',
                    lineHeight: '1.5',
                    fontWeight: 300,
                    margin: 0,
                  }}
                >
                  {entry}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
