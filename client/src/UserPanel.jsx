import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5000/api';

export default function UserPanel({ user, onLogout, onClose }) {
  const [userJobs, setUserJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const [jobsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/user/jobs`, { credentials: 'include' }),
        fetch(`${API_BASE}/user/stats`, { credentials: 'include' }),
      ]);

      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setUserJobs(data.jobs);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleVisibility = async (jobId, currentVisibility) => {
    try {
      const newVisibility = currentVisibility === 'public' ? 'private' : 'public';
      const res = await fetch(`${API_BASE}/user/jobs/${jobId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visibility: newVisibility }),
      });

      if (res.ok) {
        setUserJobs(prev =>
          prev.map(j => (j.id === jobId ? { ...j, visibility: newVisibility } : j))
        );
        if (stats) {
          setStats(prev => ({
            ...prev,
            publicJobs: newVisibility === 'public' ? prev.publicJobs + 1 : prev.publicJobs - 1,
            privateJobs: newVisibility === 'private' ? prev.privateJobs + 1 : prev.privateJobs - 1,
          }));
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      onLogout();
    } catch (err) {
      setError(err.message);
    }
  };

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
              {user?.username}
            </h2>
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontWeight: 500,
                fontSize: '0.875rem',
                margin: '0.5rem 0 0 0',
              }}
            >
              {user?.email}
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
            onMouseEnter={(e) => e.target.style.color = 'var(--color-text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--color-text-secondary)'}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#dc2626', fontWeight: 500, margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Loading...</p>
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

            <div style={{ marginBottom: '1.5rem' }}>
              <h3
                style={{
                  fontSize: '0.75rem',
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
              {userJobs.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>No jobs yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {userJobs.map(job => (
                    <div
                      key={job.id}
                      style={{
                        padding: '0.75rem',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                      }}
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
                          {job.jobName || 'Untitled Job'}
                        </p>
                        {job.description && (
                          <p
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--color-text-secondary)',
                              margin: '0.5rem 0',
                              lineHeight: '1.4',
                            }}
                          >
                            {job.description}
                          </p>
                        )}
                        <p
                          style={{
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                            margin: '0.5rem 0 0 0',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {job.id.slice(-8)}
                        </p>
                        <p
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--color-text-secondary)',
                            fontWeight: 500,
                            margin: '0.5rem 0 0 0',
                            textTransform: 'capitalize',
                          }}
                        >
                          {job.status} • {job.visibility}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleVisibility(job.id, job.visibility)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem',
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
                      >
                        {job.visibility === 'public' ? '🌐 Public' : '🔐 Private'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                fontSize: '0.75rem',
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
              }}
              onMouseEnter={(e) => e.target.style.background = 'var(--color-accent-hover)'}
              onMouseLeave={(e) => e.target.style.background = 'var(--color-accent)'}
            >
              Log Out
            </button>
          </>
        )}
      </div>
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
          fontSize: '0.75rem',
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
        {value}
      </p>
    </div>
  );
}
