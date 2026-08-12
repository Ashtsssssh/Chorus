import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { listAvailableJobs } from '../api/api.js';
import { normalizeStatus } from '../utils/statusNormalizer.js';

/**
 * JobList Component - Browse Available Jobs
 * Production hardened with:
 * - Polling interval cleanup (prevents timer leaks)
 * - Password validation for protected jobs
 * - Memory leak prevention
 * - Error handling with retry
 * - Search and filtering
 */

const CONFIG = {
  POLL_INTERVAL: 5000, // 5 seconds
  PASSWORD_MIN_LENGTH: 8,
};

export default function JobList() {
  const navigate = useNavigate();

  // Job state
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Password modal state
  const [passwordPromptJob, setPasswordPromptJob] = useState(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const pollTimerRef = useRef(null);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  /**
   * Fetch available jobs
   */
  const fetchJobs = useCallback(async () => {
    try {
      const { jobs: fetchedJobs } = await listAvailableJobs();

      if (!isMountedRef.current) return;

      setJobs(fetchedJobs || []);
      setError(null);

      // Check if any jobs are still processing
      const hasProcessing = fetchedJobs?.some(
        job => job.status === 'compiling' || job.status === 'distributing'
      );
      setIsPolling(hasProcessing);

    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[JobList] Fetch failed:', err.message);
      setError(err.message || 'Failed to fetch available jobs');
      setIsPolling(false); // Stop polling on error
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * Initial fetch
   */
  useEffect(() => {
    fetchJobs();
  }, []);

  /**
   * Polling loop - fetches jobs every 5 seconds (stops when no processing jobs)
   */
  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      try {
        await fetchJobs();
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('[JobList] Poll error:', err.message);
      }

      // Schedule next poll
      if (isMountedRef.current && isPolling) {
        pollTimerRef.current = setTimeout(poll, CONFIG.POLL_INTERVAL);
      }
    };

    pollTimerRef.current = setTimeout(poll, CONFIG.POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [isPolling, fetchJobs]);

  /**
   * Handle job selection
   */
  const handleSelectJob = useCallback((job) => {
    // Check if job is protected
    if (job.visibility === 'protected') {
      setPasswordPromptJob(job);
      setEnteredPassword('');
      setPasswordError('');
      return;
    }

    // Navigate to job processing
    navigate(`/job/${job.id}`);
  }, [navigate]);

  /**
   * Validate and submit password
   */
  const handlePasswordSubmit = useCallback(async (e) => {
    e?.preventDefault();

    if (!passwordPromptJob) return;

    // Validate password
    if (!enteredPassword || enteredPassword.length < CONFIG.PASSWORD_MIN_LENGTH) {
      setPasswordError(`Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    setPasswordError('');
    setPasswordLoading(true);

    try {
      // Note: Actual password validation happens on server side (Worker component)
      // We just pass the password along with the job
      const jobWithPassword = {
        ...passwordPromptJob,
        workerPassword: enteredPassword,
      };

      // Navigate to worker with password
      navigate(`/job/${jobWithPassword.id}`, { state: { password: enteredPassword } });

      // Close modal
      setPasswordPromptJob(null);
      setEnteredPassword('');
      setPasswordError('');

    } catch (err) {
      if (isMountedRef.current) {
        setPasswordError(err.message || 'Failed to process password');
      }
    } finally {
      if (isMountedRef.current) {
        setPasswordLoading(false);
      }
    }
  }, [passwordPromptJob, enteredPassword, navigate]);

  /**
   * Filter and search jobs
   */
  const filteredJobs = jobs.filter((job) => {
    // Search filter
    const matchesSearch = !searchQuery || 
      (job.name && job.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (job.description && job.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (job.id && job.id.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter
    const displayStatus = normalizeStatus(job.status);
    const matchesStatus = statusFilter === 'all' || displayStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  /**
   * Get status info
   */
  const getStatusInfo = (status) => {
    const displayStatus = normalizeStatus(status);
    const info = {
      completed: { color: '#10b981', icon: '✓', label: 'Completed' },
      processing: { color: '#f59e0b', icon: '⟳', label: 'Processing' },
      pending: { color: '#6b7280', icon: '⧗', label: 'Pending' },
    };
    return info[displayStatus] || info.pending;
  };

  /**
   * Get visibility badge
   */
  const getVisibilityBadge = (visibility) => {
    const badges = {
      public: { icon: '🌐', label: 'Public' },
      protected: { icon: '🔒', label: 'Protected' },
      private: { icon: '🔐', label: 'Private' },
    };
    return badges[visibility] || badges.public;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Loading state
  if (loading && jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
        style={{ background: 'var(--color-bg)' }}
      >
        <p style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
        }}>
          Loading available jobs...
        </p>
      </motion.div>
    );
  }

  // Error state
  if (error && jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
        style={{ background: 'var(--color-bg)', padding: 'var(--space-lg)' }}
      >
        <div style={{
          maxWidth: '480px',
          textAlign: 'center',
        }}>
          <p style={{
            color: '#dc2626',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            lineHeight: '1.6',
          }}>
            {error}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchJobs();
            }}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-lg)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ marginBottom: 'var(--space-3xl)' }}
      >
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2.5rem',
          fontWeight: 400,
          margin: '0 0 var(--space-md) 0',
          color: 'var(--color-text-primary)',
        }}>
          Available Jobs
        </h2>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          margin: 0,
          lineHeight: '1.6',
        }}>
          {jobs.length === 0
            ? 'No jobs available at the moment. Check back soon.'
            : `${jobs.length} compute job${jobs.length !== 1 ? 's' : ''} active on the grid`}
        </p>
        {isPolling && (
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--color-accent)',
            marginTop: 'var(--space-md)',
            fontWeight: 500,
          }}>
            ⟳ Polling for updates...
          </p>
        )}
      </motion.div>

      {/* Search & Filter */}
      {jobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            marginBottom: 'var(--space-3xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg)',
          }}
        >
          {/* Search Input */}
          <input
            type="text"
            placeholder="Search jobs by name, description, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              borderRadius: '2px',
              outline: 'none',
              transition: 'all var(--transition-fast)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--color-accent)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--color-border)';
            }}
          />

          {/* Status Filters */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            {['all', 'pending', 'processing', 'completed', 'failed'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                style={{
                  padding: '0.5rem 1rem',
                  background: statusFilter === status ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: statusFilter === status ? 'white' : 'var(--color-text-secondary)',
                  border: `1px solid ${statusFilter === status ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* No Results */}
      {filteredJobs.length === 0 && jobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            padding: '2rem',
            textAlign: 'center',
            background: 'var(--color-surface)',
            borderRadius: '2px',
            border: '1px solid var(--color-border)',
          }}
        >
          <p style={{
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
          }}>
            No jobs match your filters. Try adjusting your search.
          </p>
        </motion.div>
      )}

      {/* Jobs Grid */}
      {filteredJobs.length > 0 && (
        <motion.div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 'var(--space-lg)',
          }}
        >
          {filteredJobs.map((job) => {
            const statusInfo = getStatusInfo(job.status);
            const visibilityBadge = getVisibilityBadge(job.visibility);
            const completedChunks = job.completedChunks || 0;
            const totalChunks = job.totalChunks || 0;
            const progressPercent = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

            return (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => handleSelectJob(job)}
                style={{
                  padding: 'var(--space-lg)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '2px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  display: 'block',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 'var(--space-md)',
                }}>
                  <div>
                    <h3 style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                      marginBottom: '0.25rem',
                    }}>
                      {job.name || `Job ${job.id.slice(-8)}`}
                    </h3>
                    <p style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'monospace',
                      margin: 0,
                    }}>
                      {job.id.slice(-12)}
                    </p>
                  </div>

                  <div style={{
                    display: 'inline-flex',
                    padding: '0.375rem 0.75rem',
                    background: `rgba(${statusInfo.color === '#10b981' ? '16, 185, 129' :
                      statusInfo.color === '#f59e0b' ? '245, 158, 11' : '107, 114, 128'}, 0.1)`,
                    borderRadius: '1px',
                  }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: statusInfo.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {statusInfo.icon} {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {job.description && (
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    margin: 'var(--space-sm) 0 var(--space-lg) 0',
                    lineHeight: '1.5',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {job.description}
                  </p>
                )}

                {/* Divider */}
                <div style={{
                  height: '1px',
                  background: 'var(--color-border)',
                  margin: 'var(--space-lg) 0',
                }} />

                {/* Tags */}
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-sm)',
                  marginBottom: 'var(--space-lg)',
                }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '0.375rem 0.75rem',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-tertiary)',
                    borderRadius: '1px',
                  }}>
                    {visibilityBadge.icon} {visibilityBadge.label}
                  </span>
                </div>

                {/* Metrics */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 'var(--space-md)',
                }}>
                  <div>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-label)',
                      color: 'var(--color-text-tertiary)',
                      margin: '0 0 0.5rem 0',
                    }}>
                      Total
                    </p>
                    <p style={{
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                    }}>
                      {totalChunks}
                    </p>
                  </div>

                  <div>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-label)',
                      color: 'var(--color-text-tertiary)',
                      margin: '0 0 0.5rem 0',
                    }}>
                      Done
                    </p>
                    <p style={{
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      color: 'var(--color-accent)',
                      margin: 0,
                    }}>
                      {completedChunks}
                    </p>
                  </div>

                  <div>
                    <p style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-label)',
                      color: 'var(--color-text-tertiary)',
                      margin: '0 0 0.5rem 0',
                    }}>
                      %
                    </p>
                    <p style={{
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                    }}>
                      {Math.round(progressPercent)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                  width: '100%',
                  height: '2px',
                  background: 'var(--color-border)',
                  borderRadius: '1px',
                  overflow: 'hidden',
                  marginTop: 'var(--space-md)',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      background: 'var(--color-accent)',
                      transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* Password Modal */}
      <AnimatePresence>
        {passwordPromptJob && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-lg)',
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: 'var(--color-surface)',
                padding: 'var(--space-2xl)',
                borderRadius: '2px',
                border: '1px solid var(--color-border)',
                maxWidth: '400px',
                width: '100%',
              }}
            >
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 400,
                margin: '0 0 var(--space-md) 0',
                color: 'var(--color-text-primary)',
              }}>
                Protected Job
              </h3>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                margin: '0 0 var(--space-lg) 0',
                lineHeight: '1.6',
              }}>
                This job is password protected. Please enter the password to proceed.
              </p>

              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  value={enteredPassword}
                  onChange={(e) => {
                    setEnteredPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Enter password"
                  required
                  disabled={passwordLoading}
                  autoFocus
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--color-text-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${passwordError ? '#ef4444' : 'var(--color-border)'}`,
                    padding: 'var(--space-sm) 0',
                    width: '100%',
                    marginBottom: passwordError ? 'var(--space-sm)' : 'var(--space-xl)',
                    outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                  }}
                  onFocus={(e) => {
                    if (!passwordError) {
                      e.target.style.borderBottomColor = 'var(--color-accent)';
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderBottomColor = passwordError ? '#ef4444' : 'var(--color-border)';
                  }}
                />

                {passwordError && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#ef4444',
                    margin: '0.5rem 0 var(--space-lg) 0',
                  }}>
                    {passwordError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                  <button
                    type="submit"
                    disabled={passwordLoading || !enteredPassword}
                    style={{
                      flex: 1,
                      background: passwordLoading || !enteredPassword ? '#d1d5db' : 'var(--color-accent)',
                      color: 'white',
                      padding: 'var(--space-md)',
                      border: 'none',
                      cursor: passwordLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      transition: 'background-color var(--transition-fast)',
                      opacity: passwordLoading ? 0.6 : 1,
                    }}
                  >
                    {passwordLoading ? 'Verifying...' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordPromptJob(null);
                      setEnteredPassword('');
                      setPasswordError('');
                    }}
                    disabled={passwordLoading}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                      padding: 'var(--space-md)',
                      cursor: passwordLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      opacity: passwordLoading ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
