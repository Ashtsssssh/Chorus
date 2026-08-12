import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJob, subscribeToJobEvents } from '../api/api.js';
import { normalizeStatus } from '../utils/statusNormalizer.js';
import ExpandableDescription from '../components/ExpandableDescription';

const LOG = '[UploadedJobDashboard]';

export default function UploadedJobDashboard() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assembling, setAssembling] = useState(false);
  const [assembledBlob, setAssembledBlob] = useState(null);
  const [assemblerCode, setAssemblerCode] = useState(null);
  const [showAssemblerForm, setShowAssemblerForm] = useState(true);

  const isMountedRef = useRef(true);
  const sseRef = useRef(null);
  const workerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (sseRef.current) sseRef.current.close();
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    console.log(`${LOG} mounted for jobId=${jobId}`);

    // Initial fetch to get current state immediately
    fetchJob();

    // SSE: subscribe for instant completion notification instead of polling every 2s.
    // The server sends a 'complete' event when all chunks are done.
    sseRef.current = subscribeToJobEvents(jobId, () => {
      console.log(`${LOG} SSE: job complete event received — doing final fetch`);
      if (isMountedRef.current) fetchJob();
    });

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [jobId]);

  async function fetchJob() {
    try {
      const { job } = await getJob(jobId);
      if (isMountedRef.current) {
        setJob(job);
        setError(null);
        console.log(`${LOG} job fetched: status=${job.status} completed=${job.completedChunks}/${job.totalChunks}`);
      }
    } catch (err) {
      console.error(`${LOG} ❌ fetchJob error:`, err.message);
      if (isMountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleUploadAssembler = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.js')) {
        setError('Assembler must be a .js file');
        return;
      }

      const code = await readFileAsText(file);
      if (isMountedRef.current) {
        setAssemblerCode(code);
        setShowAssemblerForm(false);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(`Failed to read assembler: ${err.message}`);
      }
    }
  };

  const getProgressPercentage = () => {
    if (!job?.totalChunks) return 0;
    return (job.completedChunks / job.totalChunks) * 100;
  };

  const getStatusBadge = () => {
    if (!job) return 'Loading';
    const status = normalizeStatus(job.status);
    const badges = {
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
    };
    return badges[status] || status;
  };

  const getStatusLabel = () => {
    if (!job) return 'Loading...';
    const labels = {
      pending: 'Waiting for compilation...',
      compiling: 'Compiling algorithm to WASM...',
      ready: 'Compiled! Ready for processing...',
      distributing: 'Distributing to workers...',
      complete: 'All chunks processed!',
      failed: 'Job failed',
    };
    return labels[job.status] || job.status;
  };

  const runAssemblerWorker = () => {
    return new Promise((resolve, reject) => {
      if (!assemblerCode) {
        reject(new Error('No assembler code uploaded'));
        return;
      }

      console.log(`${LOG} Starting assembler worker for jobId=${job.id}`);
      // Module worker — same pattern as chunker.worker.js.
      // Vite bundles it correctly via new URL + import.meta.url.
      // The worker imports getResultData from api.js directly, so no serverUrl needed.
      const worker = new Worker(
        new URL('../workers/assembler.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.postMessage({
        jobId: job.id,
        totalChunks: job.totalChunks,
        assemblerCode,
      });
      console.log(`${LOG} assembler worker postMessage sent: jobId=${job.id} totalChunks=${job.totalChunks}`);

      worker.onmessage = (e) => {
        const { type } = e.data;
        console.log(`${LOG} [assemblerWorker] message: type=${type}`, e.data);

        if (type === 'status') {
          if (isMountedRef.current) {
            setError(null);
          }
        } else if (type === 'progress') {
          console.log(`${LOG} [assemblerWorker] progress: ${e.data.fetched}/${e.data.totalChunks}`);
        } else if (type === 'done') {
          console.log(`${LOG} ✅ Assembler worker finished, blob size:`, e.data.blob?.size);
          worker.terminate();
          workerRef.current = null;
          resolve(e.data.blob);
        } else if (type === 'error') {
          console.error(`${LOG} ❌ Assembler worker error:`, e.data.message);
          worker.terminate();
          workerRef.current = null;
          reject(new Error(e.data.message));
        }
      };

      worker.onerror = (err) => {
        console.error(`${LOG} ❌ Assembler worker uncaught error:`, err.message, err);
        worker.terminate();
        workerRef.current = null;
        reject(new Error(`Assembler worker error: ${err.message}`));
      };
    });
  };

  const handleAssemble = async () => {
    try {
      setAssembling(true);
      setError(null);
      const blob = await runAssemblerWorker();
      if (isMountedRef.current) {
        setAssembledBlob(blob);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setAssembling(false);
      }
    }
  };

  const handleDownload = () => {
    if (!assembledBlob || !job) return;

    const url = URL.createObjectURL(assembledBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `result-${job.id.slice(-8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
        }}
      >
        <p
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: '0.875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Loading job dashboard...
        </p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          background: 'var(--color-bg)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            maxWidth: '500px',
            padding: '2rem',
            background: 'var(--color-surface)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              color: '#ef4444',
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              marginBottom: '1rem',
            }}
          >
            Error
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            {error || 'Failed to load job'}
          </p>
          <button
            onClick={() => navigate('/my-jobs')}
            style={{
              background: 'var(--color-accent)',
              color: 'white',
              padding: '0.625rem 1.25rem',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.target.style.opacity = '1')}
          >
            Back to My Jobs
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
        paddingTop: '4rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            borderRadius: '8px',
            maxWidth: '600px',
            width: '100%',
            padding: '2rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <button
            onClick={() => navigate('/my-jobs')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: '1.5rem',
              padding: 0,
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => (e.target.style.color = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.target.style.color = 'var(--color-accent)')}
          >
            ← Back to My Jobs
          </button>

          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 400,
              fontFamily: 'var(--font-display)',
              color: 'var(--color-text-primary)',
              margin: '0 0 0.5rem 0',
            }}
          >
            {job.name || 'Untitled Job'}
          </h1>
          {job.description && (
            <ExpandableDescription text={job.description} isDetailView={true} />
          )}

          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'var(--color-accent-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
            }}
          >
            <p
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--color-text-tertiary)',
                margin: '0 0 0.75rem 0',
              }}
            >
              Current Stage
            </p>
            <p
              style={{
                fontSize: '1rem',
                fontWeight: 500,
                color: normalizeStatus(job.status) === 'completed' ? '#10b981' : 'var(--color-accent)',
                margin: '0 0 0.5rem 0',
              }}
            >
              {getStatusLabel()}
            </p>
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '0.375rem 0.75rem',
                background: normalizeStatus(job.status) === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(var(--color-accent-rgb), 0.2)',
                color: normalizeStatus(job.status) === 'completed' ? '#10b981' : 'var(--color-accent)',
                borderRadius: '8px',
                display: 'inline-block',
              }}
            >
              {getStatusBadge()}
            </span>
          </div>

          {job.totalChunks > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Processing Progress
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {job.completedChunks || 0}/{job.totalChunks}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(var(--color-accent-rgb), 0.15)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: getProgressPercentage() + '%' }}
                  transition={{ duration: 0.4 }}
                  style={{
                    height: '100%',
                    background: 'var(--color-accent)',
                    borderRadius: '8px',
                  }}
                />
              </div>
            </div>
          )}

          {normalizeStatus(job.status) === 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {showAssemblerForm && !assemblerCode && (
                <div
                  style={{
                    padding: '1.5rem',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--color-text-primary)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Upload Assembler Script
                  </label>
                  
                  <input
                    type="file"
                    accept=".js"
                    onChange={handleUploadAssembler}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-raised)',
                      borderRadius: '8px',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              )}

              {assemblerCode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button
                    onClick={handleAssemble}
                    disabled={assembling || assembledBlob}
                    style={{
                      background: assembling || assembledBlob ? 'var(--color-border)' : 'var(--color-accent)',
                      color: 'white',
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: assembling || assembledBlob ? 'not-allowed' : 'pointer',
                      opacity: assembling || assembledBlob ? 0.6 : 1,
                      transition: 'opacity var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => !assembling && !assembledBlob && (e.target.style.opacity = '0.8')}
                    onMouseLeave={(e) => !assembling && !assembledBlob && (e.target.style.opacity = '1')}
                  >
                    {assembling ? '⟳ Assembling...' : '🔧 Run Assembler'}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!assembledBlob}
                    style={{
                      background: !assembledBlob ? 'var(--color-border)' : 'var(--color-accent)',
                      color: 'white',
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: !assembledBlob ? 'not-allowed' : 'pointer',
                      opacity: !assembledBlob ? 0.6 : 1,
                      transition: 'opacity var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => assembledBlob && (e.target.style.opacity = '0.8')}
                    onMouseLeave={(e) => assembledBlob && (e.target.style.opacity = '1')}
                  >
                    ⬇️ Download Result
                  </button>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '8px',
                    color: '#fecaca',
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}