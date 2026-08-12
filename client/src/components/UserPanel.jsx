import { useState, useEffect, useRef } from 'react';
import { deleteJob, getUploaderJobs, getUploaderStats, updateJobVisibility, logout } from '../api/api.js';
import JobDetailsModal from './JobDetailsModal.jsx';
import { toast as sonnerToast } from 'sonner';
import ExpandableDescription from '../components/ExpandableDescription';

export default function UserPanel({ user, onLogout, onClose }) {
  const [userJobs, setUserJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('createdAt-desc');
  

  const isMountedRef = useRef(true);

  useEffect(() => {
    // CRITICAL: reset to true on every (re)mount. React 18 StrictMode
    // mounts -> unmounts -> remounts once in dev, and the cleanup below
    // sets this false on that synthetic unmount. Without resetting it
    // here, it stays false forever, silently killing every
    // `if (isMountedRef.current)` guard below for the component's
    // entire lifetime even though it is actually mounted and visible.
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchUserData();
    const timeout = setTimeout(() => {
      if (isMountedRef.current && loading) {
        setLoading(false);
        setError('Load timeout - no jobs available');
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsData, statsData] = await Promise.all([
        getUploaderJobs(),
        getUploaderStats(),
      ]);
      if (isMountedRef.current) {
        setUserJobs(jobsData.jobs || []);
        setStats(statsData.stats);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
        showToast('Failed to load data', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const showToast = (message, type = 'info') => {
    if (isMountedRef.current) {
      if (type === 'error') sonnerToast.error(message);
      else if (type === 'success') sonnerToast.success(message);
      else sonnerToast(message);
    }
  };

  const toggleVisibility = async (jobId, currentVisibility) => {
    try {
      const newVisibility = currentVisibility === 'public' ? 'private' : 'public';
      await updateJobVisibility(jobId, newVisibility);

      if (isMountedRef.current) {
        setUserJobs(prev =>
          prev.map(j => (j.id === jobId ? { ...j, visibility: newVisibility } : j))
        );
        showToast(`Job set to ${newVisibility}`, 'success');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
        showToast('Error updating visibility', 'error');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      if (isMountedRef.current) {
        showToast('Logged out successfully', 'success');
        onLogout();
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message);
        showToast('Logout failed', 'error');
      }
    }
  };

  const promptDeleteJob = (jobId) => {
    setDeleteDialog(jobId);
    setDeletePassword('');
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;

    try {
      setDeletingId(deleteDialog);
      await deleteJob(deleteDialog, deletePassword);

      if (isMountedRef.current) {
        setUserJobs(prev => prev.filter(j => j.id !== deleteDialog));
        setDeleteDialog(null);
        setDeletePassword('');
        showToast('Job deleted successfully', 'success');
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMsg = err?.message || 'Unknown error';
        setError(errorMsg);

        if (errorMsg.includes('401') || errorMsg.includes('password') || errorMsg.includes('Unauthorized')) {
          showToast('Invalid password', 'error');
        } else {
          showToast('Failed to delete job', 'error');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setDeletingId(null);
      }
    }
  };

  const filterJobs = (jobs) => {
    if (!searchQuery.trim()) return jobs;

    const query = searchQuery.toLowerCase();
    return jobs.filter(job =>
      (job.name && job.name.toLowerCase().includes(query)) ||
      (job.description && job.description.toLowerCase().includes(query)) ||
      job.id.toLowerCase().includes(query) ||
      (job.status && job.status.toLowerCase().includes(query))
    );
  };

  const sortJobs = (jobs) => {
    const [field, direction] = sortBy.split('-');
    const sorted = [...jobs];
    const isAsc = direction === 'asc';

    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (field) {
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'completion':
          aVal = a.totalChunks ? (a.completedChunks / a.totalChunks) * 100 : 0;
          bVal = b.totalChunks ? (b.completedChunks / b.totalChunks) * 100 : 0;
          break;
        case 'workers':
          aVal = a.workerCount || 0;
          bVal = b.workerCount || 0;
          break;
        case 'name':
          aVal = (a.name || 'Untitled Job').toLowerCase();
          bVal = (b.name || 'Untitled Job').toLowerCase();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return isAsc ? -1 : 1;
      if (aVal > bVal) return isAsc ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const filteredAndSorted = sortJobs(filterJobs(userJobs));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 50,
      }}
    >
      <div
        style={{
          borderRadius: '12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          maxWidth: '650px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 500,
                margin: 0,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {user?.username || 'User'}
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontWeight: 500,
                fontSize: '0.875rem',
                margin: '0.5rem 0 0 0',
              }}
            >
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0,
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => (e.target.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.target.style.color = 'var(--color-text-secondary)')}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading data...</p>
          </div>
        ) : error ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>No jobs available</p>
        ) : (
          <>
            {stats && (
              <div
                style={{
                  marginBottom: '1.5rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                }}
              >
                <StatCard label="Total Jobs" value={stats.totalJobs} />
                <StatCard label="Public" value={stats.publicJobs} highlight />
                <StatCard label="Private" value={stats.privateJobs} />
                <StatCard label="Completed" value={stats.completedJobs} />
                <StatCard label="Failed" value={stats.failedJobs} />
                <StatCard label="Processing" value={stats.processingJobs} />
              </div>
            )}
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                margin: 0,
              }}
            >
              Your Jobs
            </h3>

            {userJobs.length > 0 && (
              <div style={{ marginBottom: '1rem', marginTop: '0.75rem', display: 'flex', gap: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8rem',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                  aria-label="Search jobs"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8rem',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                  aria-label="Sort jobs by"
                >
                  <option value="createdAt-desc">Newest First</option>
                  <option value="createdAt-asc">Oldest First</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="status-asc">Status (A-Z)</option>
                  <option value="completion-desc">% Complete (High)</option>
                  <option value="completion-asc">% Complete (Low)</option>
                  <option value="workers-desc">Most Workers</option>
                  <option value="workers-asc">Fewest Workers</option>
                </select>
              </div>
            )}

            {userJobs.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>No jobs yet</p>
            ) : filteredAndSorted.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>No jobs match your search</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                {filteredAndSorted.map(job => (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-surface)';
                      e.currentTarget.style.borderColor = 'var(--color-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--color-surface-raised)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          margin: 0,
                          marginBottom: '0.25rem',
                        }}
                      >
                        {job.name || 'Untitled Job'}
                      </p>
                      {job.description && (
                        <ExpandableDescription text={job.description} />
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                          fontSize: '0.875rem',
                          color: 'var(--color-text-secondary)',
                          marginTop: '0.5rem',
                        }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>{job.status}</span>
                        <span>•</span>
                        
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisibility(job.id, job.visibility);
                        }}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          borderRadius: '999px',
                          border: job.visibility === 'public' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                          background: job.visibility === 'public' ? 'var(--color-accent-muted)' : 'var(--color-surface)',
                          color: job.visibility === 'public' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-body)',
                        }}
                        title={job.visibility === 'public' ? 'Make Private' : 'Make Public'}
                        aria-label={`Make job ${job.visibility === 'public' ? 'private' : 'public'}`}
                      >
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          promptDeleteJob(job.id);
                        }}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          borderRadius: '999px',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          background: 'rgba(239, 68, 68, 0.05)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = 'rgba(239, 68, 68, 0.05)';
                          e.target.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        }}
                        title="Delete Job"
                        aria-label="Delete job"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                background: 'var(--color-accent)',
                color: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
                fontFamily: 'var(--font-body)',
                marginTop: '1rem',
              }}
              onMouseEnter={(e) => (e.target.style.background = 'var(--color-accent-hover)')}
              onMouseLeave={(e) => (e.target.style.background = 'var(--color-accent)')}
            >
              Log Out
            </button>
          </>
        )}
      </div>

      {deleteDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 51,
          }}
          onClick={() => setDeleteDialog(null)}
          role="presentation"
        >
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <h3
              id="delete-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#ef4444',
                margin: '0 0 0.5rem 0',
              }}
            >
              Delete Job
            </h3>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                margin: '0 0 1.5rem 0',
                lineHeight: '1.5',
              }}
            >
              This action cannot be undone. All job data and results will be permanently deleted. Please enter your password to confirm.
            </p>
            <input
              type="password"
              placeholder="Enter your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !deletingId && confirmDelete()}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1.5rem',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
              disabled={deletingId === deleteDialog}
              aria-label="Password confirmation"
            />
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setDeleteDialog(null)}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'var(--font-body)',
                }}
                disabled={deletingId === deleteDialog}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  fontFamily: 'var(--font-body)',
                  opacity: deletingId === deleteDialog ? 0.7 : 1,
                }}
                disabled={deletingId === deleteDialog}
                onMouseEnter={(e) => !deletingId && (e.target.style.background = '#dc2626')}
                onMouseLeave={(e) => !deletingId && (e.target.style.background = '#ef4444')}
              >
                {deletingId === deleteDialog ? 'Deleting...' : 'Delete Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedJob && <JobDetailsModal job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div
      style={{
        padding: '0.75rem',
        background: highlight ? 'var(--color-accent-muted)' : 'var(--color-surface-raised)',
        border: highlight ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        borderRadius: '8px',
        transition: 'all 0.2s ease',
      }}
    >
      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: 0,
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: highlight ? 'var(--color-accent)' : 'var(--color-text-primary)',
          margin: 0,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value ?? 0}
      </p>
    </div>
  );
}