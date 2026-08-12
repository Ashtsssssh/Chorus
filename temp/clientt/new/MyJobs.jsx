import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { getUploaderJobs, deleteJob, updateJobVisibility } from '../api/api.js';

/**
 * MyJobs Component - User's Submitted Jobs
 * Production hardened with:
 * - Pagination (prevents DOM overload)
 * - Proper polling cleanup
 * - Error handling
 * - Visibility management
 * - Job deletion with password confirmation
 */

const CONFIG = {
  JOBS_PER_PAGE: 10,
  POLL_INTERVAL: 5000, // 5 seconds
};

export default function MyJobs({ user }) {
  const navigate = useNavigate();

  // Pagination
  const [jobs, setJobs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  // Modals
  const [deleteJobId, setDeleteJobId] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [visibilityJobId, setVisibilityJobId] = useState(null);
  const [newVisibility, setNewVisibility] = useState('public');
  const [visibilityPassword, setVisibilityPassword] = useState('');

  // Refs
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
   * Fetch jobs for current user
   */
  const fetchJobs = useCallback(async () => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    try {
      const { jobs: fetchedJobs } = await getUploaderJobs();

      if (!isMountedRef.current) return;

      setJobs(fetchedJobs || []);
      setError(null);

      // Calculate total pages
      const pages = Math.ceil((fetchedJobs?.length || 0) / CONFIG.JOBS_PER_PAGE);
      setTotalPages(Math.max(1, pages));

      // Reset to page 1 if out of range
      if (currentPage > pages) {
        setCurrentPage(1);
      }

      // Check if any jobs are still processing - keep polling
      const hasProcessing = fetchedJobs?.some(
        job => job.status === 'compiling' || job.status === 'distributing'
      );
      setIsPolling(hasProcessing);

    } catch (err) {
      if (!isMountedRef.current) return;

      console.error('[MyJobs] Fetch failed:', err.message);
      setError(err.message || 'Failed to fetch jobs');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, currentPage]);

  /**
   * Initial load
   */
  useEffect(() => {
    fetchJobs();
  }, []);

  /**
   * Polling for job updates (stops when no jobs are processing)
   */
  useEffect(() => {
    if (!isPolling || !user?.id) return;

    const poll = async () => {
      try {
        await fetchJobs();

        if (!isMountedRef.current) return;

        // Re-check if we should continue polling
        const { jobs: currentJobs } = await getUploaderJobs();
        const hasProcessing = currentJobs?.some(
          job => job.status === 'compiling' || job.status === 'distributing'
        );

        if (!isMountedRef.current) return;

        if (!hasProcessing) {
          setIsPolling(false);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('[MyJobs] Poll error:', err.message);
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
  }, [isPolling, user?.id, fetchJobs]);

  /**
   * Delete job handler
   */
  const handleDeleteJob = async (jobId) => {
    if (!deletePassword) {
      toast.error('Password required');
      return;
    }

    try {
      await deleteJob(jobId, deletePassword);
      setDeleteJobId(null);
      setDeletePassword('');
      toast.success('Job deleted');
      fetchJobs();
    } catch (err) {
      toast.error(err.message || 'Failed to delete job');
    }
  };

  /**
   * Update job visibility
   */
  const handleUpdateVisibility = async (jobId) => {
    if (newVisibility === 'protected' && !visibilityPassword) {
      toast.error('Password required for protected jobs');
      return;
    }

    try {
      await updateJobVisibility(
        jobId,
        newVisibility,
        newVisibility === 'protected' ? visibilityPassword : null
      );
      setVisibilityJobId(null);
      setNewVisibility('public');
      setVisibilityPassword('');
      toast.success('Job visibility updated');
      fetchJobs();
    } catch (err) {
      toast.error(err.message || 'Failed to update visibility');
    }
  };

  /**
   * Get status badge info
   */
  const getStatusInfo = (status) => {
    const info = {
      pending: { color: '#6b7280', label: 'Pending' },
      compiling: { color: '#f59e0b', label: 'Compiling' },
      ready: { color: '#3b82f6', label: 'Ready' },
      distributing: { color: '#f59e0b', label: 'Processing' },
      complete: { color: '#10b981', label: 'Complete' },
      failed: { color: '#ef4444', label: 'Failed' },
    };
    return info[status] || info.pending;
  };

  /**
   * Paginate jobs
   */
  const paginatedJobs = jobs.slice(
    (currentPage - 1) * CONFIG.JOBS_PER_PAGE,
    currentPage * CONFIG.JOBS_PER_PAGE
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <p style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
        }}>
          Loading your jobs...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.5rem',
          }}>
            My Jobs
          </h1>
          <p style={{
            color: 'var(--color-text-tertiary)',
            marginBottom: '1rem',
          }}>
            Manage and monitor your submitted computing jobs
          </p>

          {isPolling && (
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--color-accent)',
              fontWeight: 500,
            }}>
              ⟳ Polling for updates...
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <p style={{
              color: '#dc2626',
              fontWeight: 500,
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Empty state */}
        {jobs.length === 0 ? (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'var(--color-surface)',
            borderRadius: '0.75rem',
            border: `1px solid var(--color-border)`,
          }}>
            <p style={{
              color: 'var(--color-text-secondary)',
              fontSize: '1rem',
              marginBottom: '1rem',
            }}>
              No jobs yet
            </p>
            <button
              onClick={() => navigate('/?modal=submit')}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--color-accent)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.875rem',
                textTransform: 'uppercase',
              }}
            >
              Submit Your First Job
            </button>
          </div>
        ) : (
          <>
            {/* Jobs Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}>
              {paginatedJobs.map(job => {
                const statusInfo = getStatusInfo(job.status);
                const completedChunks = (job.chunks || []).filter(c => c.status === 'complete').length;
                const totalChunks = job.totalChunks || 0;
                const progressPercent = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;

                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => navigate(`/job/${job.id}/view`)}
                    style={{
                      padding: '1.5rem',
                      background: 'var(--color-surface)',
                      border: `1px solid var(--color-border)`,
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-accent)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Status Badge */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '1rem',
                    }}>
                      <div>
                        <h3 style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          marginBottom: '0.25rem',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                        }}>
                          {job.id.slice(-12)}
                        </h3>
                        <p style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-tertiary)',
                        }}>
                          {new Date(job.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.375rem 0.75rem',
                        background: `rgba(${statusInfo.color === '#10b981' ? '16, 185, 129' :
                          statusInfo.color === '#ef4444' ? '239, 68, 68' :
                          statusInfo.color === '#f59e0b' ? '245, 158, 11' :
                          '59, 130, 246'}, 0.1)`,
                        borderRadius: '0.375rem',
                        border: `1px solid ${statusInfo.color}`,
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: statusInfo.color,
                        }} />
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: statusInfo.color,
                        }}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.875rem',
                        marginBottom: '0.5rem',
                        color: 'var(--color-text-secondary)',
                      }}>
                        <span>Progress</span>
                        <span style={{ fontWeight: 600 }}>
                          {completedChunks}/{totalChunks}
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--color-bg)',
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

                    {/* Actions */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: `1px solid var(--color-border)`,
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setVisibilityJobId(job.id);
                          setNewVisibility(job.visibility || 'public');
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: 'var(--color-bg)',
                          border: `1px solid var(--color-border)`,
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 500,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Visibility
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteJobId(job.id);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid #ef4444',
                          borderRadius: '0.375rem',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 500,
                          color: '#dc2626',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '2rem',
              }}>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: '0.5rem 1rem',
                    background: currentPage === 1 ? '#e5e7eb' : 'var(--color-accent)',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  ← Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: page === currentPage ? 'var(--color-accent)' : 'var(--color-bg)',
                      color: page === currentPage ? 'white' : 'var(--color-text-secondary)',
                      border: `1px solid ${page === currentPage ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '0.5rem 1rem',
                    background: currentPage === totalPages ? '#e5e7eb' : 'var(--color-accent)',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        {deleteJobId && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: 'var(--color-surface)',
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '400px',
              width: '90%',
            }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '1rem',
                color: 'var(--color-text-primary)',
              }}>
                Delete Job?
              </h3>
              <p style={{
                color: 'var(--color-text-tertiary)',
                marginBottom: '1.5rem',
              }}>
                This action cannot be undone. Enter your password to confirm.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid var(--color-border)`,
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => {
                    setDeleteJobId(null);
                    setDeletePassword('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'var(--color-bg)',
                    border: `1px solid var(--color-border)`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteJob(deleteJobId)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Visibility Modal */}
        {visibilityJobId && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: 'var(--color-surface)',
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '400px',
              width: '90%',
            }}>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '1rem',
                color: 'var(--color-text-primary)',
              }}>
                Job Visibility
              </h3>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `1px solid var(--color-border)`,
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="public">Public</option>
                <option value="protected">Protected (Password)</option>
                <option value="private">Private</option>
              </select>

              {newVisibility === 'protected' && (
                <input
                  type="password"
                  value={visibilityPassword}
                  onChange={(e) => setVisibilityPassword(e.target.value)}
                  placeholder="Job password (min 8 chars)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: `1px solid var(--color-border)`,
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    boxSizing: 'border-box',
                  }}
                />
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => {
                    setVisibilityJobId(null);
                    setNewVisibility('public');
                    setVisibilityPassword('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'var(--color-bg)',
                    border: `1px solid var(--color-border)`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateVisibility(visibilityJobId)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
