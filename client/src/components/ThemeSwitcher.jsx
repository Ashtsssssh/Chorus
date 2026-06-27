import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const THEMES = [
  { id: 'github-dark', name: 'GitHub Dark', mode: 'dark' },
  { id: 'github-light', name: 'GitHub Light', mode: 'light' },
  { id: 'vercel-light', name: 'Vercel Light', mode: 'light' },
  { id: 'solarized-light', name: 'Solarized Light', mode: 'light' },
  { id: 'rose-pine-dawn', name: 'Rose Pine Dawn', mode: 'light' },
  { id: 'dracula', name: 'Dracula', mode: 'dark' },
  { id: 'nord', name: 'Nord', mode: 'dark' },
  { id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark' },
  { id: 'tailwind-dark', name: 'Tailwind Dark', mode: 'dark' },
];

const DEFAULT_THEME = 'github-dark';
const STORAGE_KEY = 'app-theme';

export function ThemeSwitcher() {
  const [active, setActive] = useState(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const currentTheme = THEMES.find(t => t.id === active) || THEMES[0];

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    const theme = THEMES.find(t => t.id === id);
    if (theme) {
      document.documentElement.setAttribute('data-mode', theme.mode);
      document.documentElement.classList.toggle('dark', theme.mode === 'dark');
    }
    localStorage.setItem(STORAGE_KEY, id);
    setActive(id);
    setIsOpen(false);
  }

  // Apply theme on mount only
  useEffect(() => {
    applyTheme(active);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Theme selector"
        aria-expanded={isOpen}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: `1px solid var(--color-border)`,
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-body)',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.target.style.color = 'var(--color-text-primary)';
          e.target.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.target.style.color = 'var(--color-text-secondary)';
            e.target.style.borderColor = 'var(--color-border)';
          }
        }}
      >
        <span>{currentTheme.name}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transition: 'transform 200ms ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              background: 'var(--color-surface-raised)',
              border: `1px solid var(--color-border)`,
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
              minWidth: '180px',
              overflow: 'hidden',
            }}
          >
            {THEMES.map((theme, index) => (
              <motion.button
                key={theme.id}
                onClick={() => applyTheme(theme.id)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.1 }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: active === theme.id ? 'var(--color-accent-muted)' : 'transparent',
                  color: active === theme.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  borderLeft: active === theme.id ? `3px solid var(--color-accent)` : '3px solid transparent',
                  fontWeight: active === theme.id ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (active !== theme.id) {
                    e.target.style.backgroundColor = 'var(--color-surface)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (active !== theme.id) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {theme.name}
                {active === theme.id && <span style={{ marginLeft: '0.5rem', fontSize: '1.2em' }}>✓</span>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}