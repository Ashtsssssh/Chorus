import React from 'react';
import Submitter from '../pages/Submitter';

export default function SubmitterModal({ user, isOpen, onClose, onJobSubmitted }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          padding: '2rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5rem',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: '12px 12px 0 0',
            }}
          >
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 500,
                margin: 0,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Upload a Job
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-text-primary)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-text-secondary)'}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              padding: '1.5rem',
              background: 'var(--color-bg)',
              flex: 1,
              overflow: 'auto',
            }}
          >
            <Submitter user={user} onJobSubmitted={onJobSubmitted} />
          </div>
        </div>
      </div>
    </>
  );
}
