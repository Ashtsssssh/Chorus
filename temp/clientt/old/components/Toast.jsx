import React, { useEffect } from 'react';

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const typeStyles = {
    success: {
      background: 'rgba(16, 185, 129, 0.1)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      color: '#10b981',
      icon: '✓',
    },
    error: {
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#ef4444',
      icon: '✕',
    },
    info: {
      background: 'rgba(59, 130, 246, 0.1)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      color: '#3b82f6',
      icon: 'ℹ',
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.1)',
      border: '1px solid rgba(245, 158, 11, 0.3)',
      color: '#f59e0b',
      icon: '⚠',
    },
  };

  const style = typeStyles[type] || typeStyles.info;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        background: style.background,
        border: style.border,
        borderRadius: '8px',
        padding: '1rem 1.25rem',
        maxWidth: '350px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        zIndex: 100,
        animation: 'slideIn 0.3s ease',
      }}
    >
      <span
        style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: style.color,
          flexShrink: 0,
        }}
      >
        {style.icon}
      </span>
      <p
        style={{
          fontSize: '0.875rem',
          color: style.color,
          fontWeight: 500,
          margin: 0,
          lineHeight: '1.5',
        }}
      >
        {message}
      </p>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: style.color,
          fontSize: '1rem',
          cursor: 'pointer',
          padding: '0 0 0 0.5rem',
          marginLeft: 'auto',
          flexShrink: 0,
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.7'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        ✕
      </button>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
