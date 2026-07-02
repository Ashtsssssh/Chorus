import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getJob, subscribeToJobEvents, getResultData } from '../api/api.js';

/**
 * UploadedJobDashboard Component - Job Status & Result Download
 * Production hardened with:
 * - Polling interval cleanup (prevents timer leaks)
 * - Stops polling when job completes
 * - Proper error handling
 * - Result assembly from chunks
 * - Download management
 */

const CONFIG = {
  POLL_INTERVAL: 2000, // 2 seconds
  MAX_POLL_ATTEMPTS: 1800, // 1 hour max
};

export default function UploadedJobDashboard() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  // Job state
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isAssembling, setIsAssembling] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const pollTimerRef = useRef(null);
  const pollAttemptsRef = useRef(0);
  const sseRef = useRef(null);
  const downloadAbortRef = useRef(new AbortController());

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Clear polling timer
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }

      // Close SSE connection
      if (sseRef.current) {
        sseRef.current.close();
      }

      // Cancel downloads
      downloadAbortRef.current.abort();
    };
  }, []);

  /**
   * Fetch job details
   */
  const fetchJobDetails = useCallback(async () => {
    if (!jobId) {
      setError('No job ID provided');
      setLoading(false);
      return;
    }

    try {
      const { job: fetchedJob } = await getJob(jobId);

      if (!isMountedRef.current) return;

      setJob(fetchedJob);
      setError(null);

      // Stop polling if job is complete or failed
      if (fetchedJob?.status === 'complete' || fetchedJob?.status === 'failed') {
        setIsPolling(false);
      } else {
        setIsPolling(true);
      }

      return fetchedJob;
    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[Dashboard] Fetch failed:', err.message);
      setError(err.message || 'Failed to fetch job details');
      setIsPolling(false);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [jobId]);

  /**
   * Start polling for job updates (stops when complete)
   */
  useEffect(() => {
    if (!jobId) return;

    // Initial fetch
    const initialFetch = async () => {
      const fetchedJob = await fetchJobDetails();

      if (!isMountedRef.current) return;

      // If already complete, don't poll
      if (fetchedJob?.status === 'complete' || fetchedJob?.status === 'failed') {
        setIsPolling(false);
        return;
      }

      // Start polling
      setIsPolling(true);
    };

    initialFetch();
  }, [jobId, fetchJobDetails]);

  /**
   * Polling loop - fetches status every 2 seconds until complete
   */
  useEffect(() => {
    if (!isPolling || !jobId) return;

    const poll = async () => {
      try {
        const { job: fetchedJob } = await getJob(jobId);

        if (!isMountedRef.current) return;

        setJob(fetchedJob);

        // Stop polling if complete or failed
        if (fetchedJob?.status === 'complete' || fetchedJob?.status === 'failed') {
          setIsPolling(false);
          if (fetchedJob?.status === 'complete') {
            toast.success('Job completed!');
          } else {
            toast.error('Job failed');
          }
          return;
        }

        // Max polling attempts (1 hour)
        pollAttemptsRef.current += 1;
        if (pollAttemptsRef.current >= CONFIG.MAX_POLL_ATTEMPTS) {
          setIsPolling(false);
          setError('Job processing timeout (1 hour exceeded)');
          return;
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        console.error('[Dashboard] Poll error:', err.message);
        // Continue polling even on error
      }

      // Schedule next poll
      if (isMountedRef.current && isPolling) {
        pollTimerRef.current = setTimeout(poll, CONFIG.POLL_INTERVAL);
      }
    };

    // Start polling
    pollTimerRef.current = setTimeout(poll, CONFIG.POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [isPolling, jobId]);

  /**
   * Subscribe to SSE events for real-time updates
   */
  useEffect(() => {
    if (!jobId || !isPolling) return;

    try {
      sseRef.current = subscribeToJobEvents(jobId, () => {
        if (isMountedRef.current) {
          setIsPolling(false);
          fetchJobDetails();
        }
      });
    } catch (err) {
      console.warn('[Dashboard] SSE subscription failed:', err.message);
      // Continue with polling fallback
    }

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, [jobId, isPolling, fetchJobDetails]);

  /**
   * Download and assemble results
   */
  const handleDownload = async () => {
    if (!job?.chunks || job.chunks.length === 0) {
      toast.error('No results available');
      return;
    }

    setIsAssembling(true);
    setDownloadProgress(0);

    try {
      // Fetch all result chunks
      const results = [];
      const totalChunks = job.chunks.filter(c => c.status === 'complete').length;

      for (let i = 0; i < job.chunks.length; i++) {
        const chunk = job.chunks[i];

        if (chunk.status !== 'complete') {
          continue;
        }

        try {
          const resultData = await getResultData(job.id, i);
          results.push(resultData);

          // Update progress
          setDownloadProgress(Math.round(((results.length / totalChunks) * 100)));
        } catch (err) {
          console.error(`[Dashboard] Failed to fetch result ${i}:`, err.message);
          toast.error(`Failed to fetch result chunk ${i}`);
          setIsAssembling(false);
          return;
        }

        if (!isMountedRef.current) return;
      }

      if (!isMountedRef.current) return;

      // Assemble results
      if (results.length === 0) {
        toast.error('No completed chunks to download');
        setIsAssembling(false);
        return;
      }

      // Combine all results into single file
      const assembled = results.join('\n');
      const blob = new Blob([assembled], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${job.id.slice(-8)}-results.txt`;
      document.body.appendChild(a);

      try {
        a.click();
        toast.success('Results downloaded successfully');
      } finally {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('[Dashboard] Download failed:', err.message);
      toast.error('Failed to download results');
    } finally {
      if (isMountedRef.current) {
        setIsAssembling(false);
        setDownloadProgress(0);
      }
    }
  };

  /**
   * Get status badge color
   */
  const getStatusColor = (status) => {
    switch (status) {
      case 'complete':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      case 'processing':
      case 'distributing':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  /**
   * Get status label
   */
  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pending',
      compiling: 'Compiling',
      ready: 'Ready',
      distributing: 'Processing',
      complete: 'Complete',
      failed: 'Failed',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
        }}>
          Loading job details...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
        <div style={{
          maxWidth: '480px',
          textAlign: 'center',
        }}>
          <h2 style={{
            color: 'var(--color-text-primary)',
            fontSize: '1.5rem',
            marginBottom: 'var(--space-lg)',
          }}>
            Error
          </h2>
          <p style={{
            color: 'var(--color-text-tertiary)',
            marginBottom: 'var(--space-2xl)',
            lineHeight: '1.6',
          }}>
            {error}
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'var(--color-accent)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              borderRadius: '2px',
            }}
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
        }}>
          Job not found
        </p>
      </div>
    );
  }

  const completedChunks = (job.chunks || []).filter(c => c.status === 'complete').length;
  const totalChunks = job.totalChunks || 0;
  const progressPercent = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;
  const isComplete = job.status === 'complete';
  const isFailed = job.status === 'failed';

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <h1 style={{
                fontSize: '2rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: '0.5rem',
              }}>
                Job Details
              </h1>
              <p style={{
                color: 'var(--color-text-tertiary)',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
              }}>
                {job.id}
              </p>
            </div>

            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.75rem 1.5rem',
              background: `rgba(${getStatusColor(job.status) === '#10b981' ? '16, 185, 129' : 
                          getStatusColor(job.status) === '#ef4444' ? '239, 68, 68' : 
                          getStatusColor(job.status) === '#f59e0b' ? '245, 158, 11' : 
                          '107, 114, 128'}, 0.1)`,
              borderRadius: '0.5rem',
              border: `1px solid ${getStatusColor(job.status)}`,
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: getStatusColor(job.status),
              }} />
              <span style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: getStatusColor(job.status),
              }}>
                {getStatusLabel(job.status)}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-bg)',
              border: `1px solid var(--color-border)`,
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            ← Back to Browse
          </button>
        </div>

        {/* Info Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            padding: '1.5rem',
            background: 'var(--color-surface)',
            border: `1px solid var(--color-border)`,
            borderRadius: '0.75rem',
          }}>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}>
              Submitted By
            </p>
            <p style={{
              fontSize: '1rem',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
              wordBreak: 'break-all',
            }}>
              {job.submitterId}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            background: 'var(--color-surface)',
            border: `1px solid var(--color-border)`,
            borderRadius: '0.75rem',
          }}>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}>
              Total Chunks
            </p>
            <p style={{
              fontSize: '1.5rem',
              color: 'var(--color-accent)',
              fontWeight: 700,
            }}>
              {totalChunks}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            background: 'var(--color-surface)',
            border: `1px solid var(--color-border)`,
            borderRadius: '0.75rem',
          }}>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}>
              Completed
            </p>
            <p style={{
              fontSize: '1.5rem',
              color: 'var(--color-accent)',
              fontWeight: 700,
            }}>
              {completedChunks}/{totalChunks}
            </p>
          </div>
        </div>

        {/* Progress Section */}
        <div style={{
          padding: '1.5rem',
          background: 'var(--color-surface)',
          border: `1px solid var(--color-border)`,
          borderRadius: '0.75rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}>
            <h2 style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}>
              Progress
            </h2>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-accent)',
            }}>
              {progressPercent}%
            </span>
          </div>

          <div style={{
            width: '100%',
            height: '12px',
            background: 'var(--color-bg)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-accent), #1d4ed8)',
                width: `${progressPercent}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {isPolling && (
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              marginTop: '0.75rem',
            }}>
              Polling for updates...
            </p>
          )}
        </div>

        {/* Download Button */}
        {isComplete && (
          <div style={{ marginBottom: '2rem' }}>
            <button
              onClick={handleDownload}
              disabled={isAssembling || completedChunks === 0}
              style={{
                padding: '0.75rem 1.5rem',
                background: isAssembling ? '#d1d5db' : 'var(--color-accent)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: isAssembling ? 'not-allowed' : 'pointer',
                opacity: isAssembling ? 0.6 : 1,
                fontSize: '0.875rem',
                textTransform: 'uppercase',
              }}
            >
              {isAssembling ? `Assembling... ${downloadProgress}%` : '↓ Download Results'}
            </button>
          </div>
        )}

        {isFailed && (
          <div style={{
            padding: '1.5rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '0.75rem',
            marginBottom: '2rem',
          }}>
            <p style={{
              color: '#dc2626',
              fontWeight: 500,
            }}>
              Job failed: {job.errorDetail || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Chunks List */}
        <div>
          <h2 style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '1rem',
          }}>
            Chunks
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '0.75rem',
          }}>
            {(job.chunks || []).map((chunk, idx) => (
              <div
                key={idx}
                style={{
                  padding: '1rem',
                  background: chunk.status === 'complete'
                    ? 'rgba(16, 185, 129, 0.1)'
                    : chunk.status === 'failed'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'var(--color-bg)',
                  border: `1px solid ${
                    chunk.status === 'complete'
                      ? '#10b981'
                      : chunk.status === 'failed'
                      ? '#ef4444'
                      : 'var(--color-border)'
                  }`,
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                }}
              >
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: '0.25rem',
                }}>
                  #{chunk.index}
                </p>
                <p style={{
                  fontSize: '0.75rem',
                  color: chunk.status === 'complete'
                    ? '#10b981'
                    : chunk.status === 'failed'
                    ? '#ef4444'
                    : 'var(--color-text-tertiary)',
                  textTransform: 'capitalize',
                  fontWeight: 500,
                }}>
                  {chunk.status}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
