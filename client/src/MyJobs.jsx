import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { listJobs, updateJobVisibility } from './api.js';
import { normalizeStatus } from './utils/statusNormalizer.js';
import { Toaster, toast } from 'sonner';

export default function MyJobs({ user }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingJobId, setEditingJobId] = useState(null);
  const [editVisibility, setEditVisibility] = useState(null);
  const [editPassword, setEditPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchMyJobs();
    const interval = setInterval(fetchMyJobs, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchMyJobs = async () => {
    try {
      const { jobs } = await listJobs(user.id);
      setJobs(jobs);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeVisibility = (jobId, job) => {
    setEditingJobId(jobId);
    setEditVisibility(job.visibility);
    setEditPassword(job.password || '');
    setShowPasswordField(job.visibility === 'protected');
  };

  const handleSaveVisibility = async (jobId) => {
    try {
      await updateJobVisibility(jobId, editVisibility, editVisibility === 'protected' ? editPassword : null);
      setEditingJobId(null);
      toast.success('Job visibility updated');
      fetchMyJobs();
    } catch (err) {
      toast.error('Error: ' + err.message);
    }
  };

  const filterJobs = () => {
    return jobs.filter(job => {
      // Search by name or description
      const matchesSearch = !searchQuery || 
        (job.name && job.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (job.description && job.description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Filter by status - normalize backend status to frontend display status
      const displayStatus = normalizeStatus(job.status);
      const matchesStatus = statusFilter === 'all' || displayStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  };

  const filteredJobs = filterJobs();

  const getProgressPercentage = (job) => {
    if (!job.totalChunks) return 0;
    return (job.completedChunks / job.totalChunks) * 100;
  };

  if (loading && jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
          Loading your jobs
        </p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <div style={{ padding: 'var(--space-lg)', border: '1px solid #ef4444', borderRadius: '2px', color: '#dc2626' }}>
          Error: {error}
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <Toaster position="top-center" theme="light" />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-lg)' }}>
        {/* Section Header */}
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
            My Jobs
          </h2>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary)',
            margin: 0,
            lineHeight: '1.6',
          }}>
            {jobs.length === 0
              ? 'No jobs yet. Upload one to get started.'
              : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} submitted`}
          </p>
        </motion.div>

        {/* Search & Filter Section */}
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
            <div>
              <input
                type="text"
                placeholder="Search jobs by name or description..."
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
                  e.target.style.boxShadow = '0 0 0 3px rgba(var(--color-accent-rgb), 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--color-border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Status Filters */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {['all', 'pending', 'processing', 'completed', 'failed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  style={{
                    padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    border: '1px solid var(--color-border)',
                    borderRadius: '2px',
                    background: statusFilter === status ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: statusFilter === status ? 'white' : 'var(--color-text-primary)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (statusFilter !== status) {
                      e.target.style.borderColor = 'var(--color-accent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (statusFilter !== status) {
                      e.target.style.borderColor = 'var(--color-border)';
                    }
                  }}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            {/* Results count */}
            {filteredJobs.length !== jobs.length && (
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}>
                Showing {filteredJobs.length} of {jobs.length} jobs
              </p>
            )}
          </motion.div>
        )}

        {jobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{
              textAlign: 'center',
              padding: 'var(--space-4xl) var(--space-lg)',
              border: '1px solid var(--color-border)',
              borderRadius: '2px',
              background: 'var(--color-surface)',
            }}
          >
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-tertiary)',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-label)',
            }}>
              No jobs submitted yet
            </p>
          </motion.div>
        ) : filteredJobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{
              textAlign: 'center',
              padding: 'var(--space-4xl) var(--space-lg)',
              border: '1px solid var(--color-border)',
              borderRadius: '2px',
              background: 'var(--color-surface)',
            }}
          >
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
              margin: '0 0 0.5rem 0',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-label)',
            }}>
              No jobs match your filters
            </p>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-tertiary)',
              margin: 0,
            }}>
              Try adjusting your search or filters
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}
          >
            {filteredJobs.map((job, idx) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                onClick={() => !editingJobId && navigate(`/job/${job.id}/view`)}
                style={{
                  padding: 'var(--space-lg)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  transition: 'all var(--transition-fast)',
                  cursor: editingJobId ? 'default' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!editingJobId) {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.background = 'var(--color-surface-raised)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'var(--color-surface)';
                }}
              >
                {/* Job Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      margin: 0,
                      color: 'var(--color-text-primary)',
                    }}>
                      {job.name || 'Untitled Job'}
                    </h3>
                    {job.description && (
                      <p style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        margin: 'var(--space-sm) 0 0 0',
                        lineHeight: '1.6',
                      }}>
                        {job.description}
                      </p>
                    )}
                  </div>

                  {/* Actions / Edit Controls */}
                  {editingJobId === job.id ? (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <select
                        value={editVisibility}
                        onChange={(e) => {
                          setEditVisibility(e.target.value);
                          setShowPasswordField(e.target.value === 'protected');
                        }}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.875rem',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-primary)',
                          borderRadius: '2px',
                          outline: 'none',
                        }}
                      >
                        <option value="public">Public</option>
                        <option value="protected">Protected</option>
                        <option value="private">Private</option>
                      </select>
                      {showPasswordField && (
                        <input
                          type="password"
                          placeholder="Password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.875rem',
                            padding: '0.5rem 0.75rem',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text-primary)',
                            borderRadius: '2px',
                            outline: 'none',
                          }}
                        />
                      )}
                      <button
                        onClick={() => handleSaveVisibility(job.id)}
                        style={{
                          background: '#10b981',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          border: 'none',
                          borderRadius: '2px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'background-color var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#059669'}
                        onMouseLeave={(e) => e.target.style.background = '#10b981'}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingJobId(null)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* Visibility Badge */}
                      <button
                        onClick={() => handleChangeVisibility(job.id, job)}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '0.375rem 0.75rem',
                          border: '1px solid var(--color-accent)',
                          background: 'var(--color-accent-muted)',
                          color: 'var(--color-accent)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = 'var(--color-accent)';
                          e.target.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = 'var(--color-accent-muted)';
                          e.target.style.color = 'var(--color-accent)';
                        }}
                      >
                        {(job.visibility || 'public') === 'protected' && '🔒 '}
                        {(job.visibility || 'public').charAt(0).toUpperCase() + (job.visibility || 'public').slice(1)}
                      </button>

                      {/* Status Badge */}
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        padding: '0.375rem 0.75rem',
                        border: '1px solid var(--color-border)',
                        background: normalizeStatus(job.status) === 'completed' ? 'rgba(16, 185, 129, 0.08)' : normalizeStatus(job.status) === 'processing' ? 'rgba(var(--color-accent-rgb), 0.08)' : 'var(--color-border-subtle)',
                        color: normalizeStatus(job.status) === 'completed' ? '#10b981' : normalizeStatus(job.status) === 'processing' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        borderRadius: '1px',
                      }}>
                        {normalizeStatus(job.status) === 'completed' ? '✓ Completed' : normalizeStatus(job.status) === 'processing' ? '⟳ Processing' : '⧗ Pending'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Job Stats Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 'var(--space-lg)',
                  paddingTop: 'var(--space-lg)',
                  borderTop: '1px solid var(--color-border)',
                  marginBottom: 'var(--space-lg)',
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
                      Total Chunks
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.5rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                    }}>
                      {job.totalChunks || 0}
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
                      Completed
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.5rem',
                      fontWeight: 400,
                      color: 'var(--color-accent)',
                      margin: 0,
                    }}>
                      {job.completedChunks || 0}
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
                      Workers
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.5rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                    }}>
                      {job.workerCount || 0}
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
                      Created
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      margin: 0,
                    }}>
                      {new Date(job.createdAt).toLocaleDateString()}
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
                  marginBottom: 'var(--space-md)',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${getProgressPercentage(job)}%`,
                      background: 'var(--color-accent)',
                      transition: 'width var(--transition-fast)',
                    }}
                  />
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    ID: {job.id.substring(0, 8)}...
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                  }}>
                    {getProgressPercentage(job).toFixed(0)}% complete
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </>
  );
}
