import React from 'react';

export default function JobDetailsModal({ job, onClose }) {
  if (!job) return null;

  const completionPercent = job.totalChunks
    ? Math.round((job.completedChunks / job.totalChunks) * 100)
    : 0;

  const statusColors = {
    pending: '#f59e0b',
    compiling: '#3b82f6',
    ready: '#10b981',
    distributing: '#8b5cf6',
    complete: '#10b981',
    failed: '#ef4444',
  };

  const statusEmoji = {
    pending: '⏳',
    compiling: '⚙️',
    ready: '✅',
    distributing: '🚀',
    complete: '✨',
    failed: '❌',
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        zIndex: 52,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          maxWidth: '550px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>
                {statusEmoji[job.status] || '❓'}
              </span>
              <h2
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary)',
                }}
              >
                {job.name || 'Untitled Job'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 0,
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.target.style.color = 'var(--color-text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--color-text-secondary)'}
          >
            ✕
          </button>
        </div>

        {/* Status Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              margin: '0 0 0.75rem 0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Status
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
            }}
          >
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  margin: '0 0 0.5rem 0',
                  textTransform: 'uppercase',
                }}
              >
                Job Status
              </p>
              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: statusColors[job.status],
                  margin: 0,
                  textTransform: 'capitalize',
                }}
              >
                {job.status}
              </p>
            </div>
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  margin: '0 0 0.5rem 0',
                  textTransform: 'uppercase',
                }}
              >
                Visibility
              </p>
              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: job.visibility === 'public' ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  margin: 0,
                  textTransform: 'capitalize',
                }}
              >
                {job.visibility === 'public' ? '🌐 Public' : '🔐 Private'}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {job.totalChunks > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                margin: '0 0 0.75rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Processing Progress
            </h3>
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  Chunks Completed
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--color-accent)',
                  }}
                >
                  {job.completedChunks} / {job.totalChunks}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  background: 'var(--color-surface-raised)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${completionPercent}%`,
                    background: `linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-tertiary)',
                  margin: '0.5rem 0 0 0',
                  textAlign: 'right',
                }}
              >
                {completionPercent}% complete
              </p>
            </div>
          </div>
        )}

        {/* Description Section */}
        {job.description && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                margin: '0 0 0.75rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Description
            </h3>
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {job.description}
            </div>
          </div>
        )}

        {/* Error Details Section */}
        {job.errorDetail && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ef4444',
                margin: '0 0 0.75rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Error Details
            </h3>
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: '#dc2626',
                fontFamily: 'var(--font-mono)',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              {job.errorDetail}
            </div>
          </div>
        )}

        {/* Metadata Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              margin: '0 0 0.75rem 0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Details
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                padding: '0.5rem',
                background: 'var(--color-surface-raised)',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
              }}
            >
              <p
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.25rem 0',
                  textTransform: 'uppercase',
                }}
              >
                Workers
              </p>
              <p
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                  margin: 0,
                }}
              >
                {job.workerCount || 0}
              </p>
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                padding: '0.5rem',
                background: 'var(--color-surface-raised)',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
              }}
            >
              <p
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.25rem 0',
                  textTransform: 'uppercase',
                }}
              >
                Total Chunks
              </p>
              <p
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {job.totalChunks || 'N/A'}
              </p>
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                padding: '0.5rem',
                background: 'var(--color-surface-raised)',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                gridColumn: '1 / -1',
              }}
            >
              <p
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  margin: '0 0 0.25rem 0',
                  textTransform: 'uppercase',
                }}
              >
                Created
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {formatDate(job.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Assembler Strategy */}
        {job.assemblerStrategy && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                margin: '0 0 0.75rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Assembly Strategy
            </h3>
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {job.assemblerStrategy}
            </div>
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: 'var(--font-body)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--color-accent-muted)';
            e.target.style.borderColor = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'var(--color-surface-raised)';
            e.target.style.borderColor = 'var(--color-border)';
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
