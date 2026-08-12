import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getJob, API_BASE } from '../api/api.js';
import { normalizeStatus } from '../utils/statusNormalizer.js';
export default function UploadedJobDashboard() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assembling, setAssembling] = useState(false);
  const [assembliedBlob, setAssembliedBlob] = useState(null);
  const [assemblerCode, setAssemblerCode] = useState(null);
  const [showAssemblerForm, setShowAssemblerForm] = useState(true);

  useEffect(() => {
    fetchJob();
    // Poll more frequently while not complete
    const interval = setInterval(() => {
      if (job && job.status !== 'complete' && job.status !== 'failed') {
        fetchJob();
      }
    }, 1000);  // Update every 1 second while processing
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const fetchJob = async () => {
    try {
      const { job } = await getJob(jobId);
      setJob(job);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const readText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });

  const handleUploadAssembler = async (e) => {
    e.preventDefault();
    try {
      const file = e.target.files[0];
      if (!file) return;
      const code = await readText(file);
      setAssemblerCode(code);
      setShowAssemblerForm(false);
      setError(null);
    } catch (err) {
      setError('Failed to read assembler file: ' + err.message);
    }
  };

  const getProgressPercentage = () => {
    if (!job || !job.totalChunks) return 0;
    return (job.completedChunks / job.totalChunks) * 100;
  };

  const getStatusBadge = () => {
    if (!job) return 'Loading';
    const displayStatus = normalizeStatus(job.status);
    switch (displayStatus) {
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return displayStatus;
    }
  };

  const getStatusLabel = () => {
    if (!job) return 'Loading...';
    switch (job.status) {
      case 'pending':
        return 'Waiting for compilation...';
      case 'compiling':
        return 'Compiling algorithm to WASM...';
      case 'ready':
        return 'Compiled! Ready for processing...';
      case 'distributing':
        return 'Distributing to workers...';
      case 'complete':
        return 'All chunks processed!';
      case 'failed':
        return 'Job failed';
      default:
        return job.status;
    }
  };

  const runAssemblerWorker = async () => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!assemblerCode) {
          throw new Error('No assembler code uploaded');
        }

        const worker = new Worker('/workers/assembler.worker.js');
        worker.postMessage({
          jobId: job.id,
          totalChunks: job.totalChunks,
          assemblerCode: assemblerCode,
          serverUrl: API_BASE
        });

        worker.onmessage = (e) => {
          const { type } = e.data;
          if (type === 'done') {
            worker.terminate();
            resolve(e.data.blob);
          }
          if (type === 'error') {
            worker.terminate();
            reject(new Error(e.data.message));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error('Assembler worker error: ' + err.message));
        };
      } catch (err) {
        reject(err);
      }
    });
  };

  const handleAssemble = async () => {
    try {
      setAssembling(true);
      setError(null);
      const outputBlob = await runAssemblerWorker();
      setAssembliedBlob(outputBlob);
    } catch (err) {
      setError(err.message);
    } finally {
      setAssembling(false);
    }
  };

  const handleDownload = () => {
    if (!assembliedBlob) return;
    const url = URL.createObjectURL(assembliedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assembled-result-${job.id.slice(-8)}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}>
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Loading job dashboard...
        </p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'var(--color-bg)',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            maxWidth: '500px',
            padding: '2rem',
            background: 'var(--color-surface)',
            border: '1px solid #ef4444',
            borderRadius: '2px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#ef4444', fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '1rem' }}>
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
              borderRadius: '2px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'opacity var(--transition-fast)',
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
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
            borderRadius: '2px',
            maxWidth: '600px',
            width: '100%',
            padding: '2rem',
            background: 'rgba(var(--color-accent-rgb), 0.08)',
            border: '1px solid var(--color-border)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Back Button */}
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
            onMouseEnter={(e) => e.target.style.color = 'var(--color-accent-hover)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--color-accent)'}
          >
            ← Back to My Jobs
          </button>

          {/* Header */}
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
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                margin: '0 0 1.5rem 0',
                lineHeight: '1.6',
              }}
            >
              {job.description}
            </p>
          )}
 
          {/* Status and Stage */}
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'rgba(var(--color-accent-rgb), 0.12)',
              border: '1px solid var(--color-border)',
              borderRadius: '2px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <p
              style={{
                fontSize: '0.75rem',
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
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '0.375rem 0.75rem',
                background: normalizeStatus(job.status) === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(var(--color-accent-rgb), 0.2)',
                color: normalizeStatus(job.status) === 'completed' ? '#10b981' : 'var(--color-accent)',
                borderRadius: '1px',
                display: 'inline-block',
              }}
            >
              {getStatusBadge()}
            </span>
          </div>

          {/* Progress Bar */}
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
                  borderRadius: '3px',
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
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Stats Grid
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '2px',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.5rem 0',
                }}
              >
                Total
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  fontWeight: 400,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {job.totalChunks || 0}
              </p>
            </div>

            <div
              style={{
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '2px',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.5rem 0',
                }}
              >
                Completed
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  fontWeight: 400,
                  color: '#10b981',
                  margin: 0,
                }}
              >
                {job.completedChunks || 0}
              </p>
            </div>

            <div
              style={{
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '2px',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.5rem 0',
                }}
              >
                Failed
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.5rem',
                  fontWeight: 400,
                  color: job.failedChunks > 0 ? '#ef4444' : 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {job.failedChunks || 0}
              </p>
            </div>
          </div> */}

          {/* Process/Download Actions */}
          {normalizeStatus(job.status) === 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Assembler Upload */}
              {showAssemblerForm && !assemblerCode && (
                <div style={{
                  padding: '1.5rem',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '2px',
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--color-text-primary)',
                    marginBottom: '0.75rem',
                  }}>
                    Upload Assembler Script
                  </label>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    marginBottom: '1rem',
                  }}>
                    JavaScript function(results[]) → final output string
                  </p>
                  <input
                    type="file"
                    accept=".js"
                    onChange={handleUploadAssembler}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-raised)',
                      borderRadius: '2px',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              )}

              {/* Assembler Loaded + Run/Download */}
              {assemblerCode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button
                    onClick={handleAssemble}
                    disabled={assembling || assembliedBlob}
                    style={{
                      background: assembling || assembliedBlob ? 'var(--color-border)' : 'var(--color-accent)',
                      color: 'white',
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: assembling || assembliedBlob ? 'not-allowed' : 'pointer',
                      opacity: assembling || assembliedBlob ? 0.6 : 1,
                      transition: 'opacity var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => !assembling && !assembliedBlob && (e.target.style.opacity = '0.8')}
                    onMouseLeave={(e) => !assembling && !assembliedBlob && (e.target.style.opacity = '1')}
                  >
                    {assembling ? '⟳ Assembling...' : '🔧 Run Assembler'}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!assembliedBlob}
                    style={{
                      background: !assembliedBlob ? 'var(--color-border)' : 'var(--color-accent)',
                      color: 'white',
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: !assembliedBlob ? 'not-allowed' : 'pointer',
                      opacity: !assembliedBlob ? 0.6 : 1,
                      transition: 'opacity var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => assembliedBlob && (e.target.style.opacity = '0.8')}
                    onMouseLeave={(e) => assembliedBlob && (e.target.style.opacity = '1')}
                  >
                    ⬇️ Download Result
                  </button>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  borderRadius: '2px',
                  color: '#fecaca',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                }}>
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
