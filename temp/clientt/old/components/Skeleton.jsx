import React from 'react';

export default function Skeleton({ count = 1, height = '1rem' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: height,
            background: 'linear-gradient(90deg, var(--color-surface-raised) 25%, var(--color-surface) 50%, var(--color-surface-raised) 75%)',
            backgroundSize: '200% 100%',
            borderRadius: '6px',
            animation: 'pulse 2s infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            background-position: 200% 0;
          }
          50% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}
