import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { listAvailableJobs } from './api.js';
import { normalizeStatus } from './utils/statusNormalizer.js';

export default function JobList({ onSelectJob, onStartProcessing }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [passwordPromptJob, setPasswordPromptJob] = useState(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchJobs = async () => {
    try {
      const { jobs } = await listAvailableJobs();
      setJobs(jobs);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectJob = (job) => {
    if (job.visibility === 'protected') {
      setPasswordPromptJob(job);
      setEnteredPassword('');
      setPasswordError('');
      return;
    }
    setSelectedJobId(job.id);
    onSelectJob(job);
    onStartProcessing(job);
  };

  const handlePasswordSubmit = (job) => {
    const jobWithPassword = { ...job, workerPassword: enteredPassword };
    setSelectedJobId(job.id);
    onSelectJob(jobWithPassword);
    onStartProcessing(jobWithPassword);
    setPasswordPromptJob(null);
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

  if (loading && jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center min-h-[60vh]"
      >
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
          Loading available jobs
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
            : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} waiting for processing`}
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
            No jobs available
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
              onClick={() => handleSelectJob(job)}
              style={{
                padding: 'var(--space-lg)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.background = 'var(--color-surface-raised)';
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

                {/* Status Badges */}
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Visibility Badge */}
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '0.375rem 0.75rem',
                    background: job.visibility === 'protected' ? 'var(--color-accent-muted)' : 'var(--color-border-subtle)',
                    color: job.visibility === 'protected' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    borderRadius: '1px',
                  }}>
                    {job.visibility === 'protected' ? '🔒 Protected' : job.visibility === 'private' ? '🔐 Private' : '🌐 Public'}
                  </span>

                  {/* Status Badge */}
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '0.375rem 0.75rem',
                    background: normalizeStatus(job.status) === 'completed' ? 'rgba(16, 185, 129, 0.08)' : normalizeStatus(job.status) === 'processing' ? 'rgba(var(--color-accent-rgb), 0.08)' : 'var(--color-border-subtle)',
                    color: normalizeStatus(job.status) === 'completed' ? '#10b981' : normalizeStatus(job.status) === 'processing' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    borderRadius: '1px',
                  }}>
                    {normalizeStatus(job.status) === 'completed' ? '✓ Completed' : normalizeStatus(job.status) === 'processing' ? '⟳ Processing' : '⧗ Pending'}
                  </span>
                </div>
              </div>

              {/* Progress Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-lg)',
                paddingTop: 'var(--space-lg)',
                borderTop: '1px solid var(--color-border)',
              }}>
                {/* Total Chunks */}
                <div>
                  <p style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-label)',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                    marginBottom: '0.5rem',
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

                {/* Completed Chunks */}
                <div>
                  <p style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-label)',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                    marginBottom: '0.5rem',
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

                {/* Progress Bar */}
                <div>
                  <p style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-label)',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                    marginBottom: '0.5rem',
                  }}>
                    Progress
                  </p>
                  <div style={{
                    width: '100%',
                    height: '2px',
                    background: 'var(--color-border)',
                    borderRadius: '1px',
                    overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${job.totalChunks ? (job.completedChunks / job.totalChunks) * 100 : 0}%`,
                        background: 'var(--color-accent)',
                        transition: 'width var(--transition-fast)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Password Prompt Modal */}
      {passwordPromptJob && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: 'var(--color-surface)',
              padding: 'var(--space-2xl)',
              borderRadius: '2px',
              border: '1px solid var(--color-border)',
              maxWidth: '400px',
              width: '90%',
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
              This job is password protected. Please enter the password to continue.
            </p>

            <input
              type="password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                color: 'var(--color-text-primary)',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--color-border)',
                padding: 'var(--space-sm) 0',
                width: '100%',
                marginBottom: 'var(--space-lg)',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
              onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
              onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
            />

            {passwordError && (
              <p style={{ color: '#dc2626', fontSize: '0.75rem', marginBottom: 'var(--space-md)' }}>
                {passwordError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <button
                onClick={() => {
                  handlePasswordSubmit(passwordPromptJob);
                }}
                style={{
                  flex: 1,
                  background: 'var(--color-accent)',
                  color: 'white',
                  padding: 'var(--space-md)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  transition: 'background-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--color-accent-hover)'}
                onMouseLeave={(e) => e.target.style.background = 'var(--color-accent)'}
              >
                Submit
              </button>
              <button
                onClick={() => setPasswordPromptJob(null)}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
