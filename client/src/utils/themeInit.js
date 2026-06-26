/**
 * Theme initialization utility
 * Run on page load (before React mounts) to prevent flash
 */

const DEFAULT_THEME = 'slate-amber';
const STORAGE_KEY = 'app-theme';

export function initializeTheme() {
  if (typeof window === 'undefined') return;

  const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', saved);

  // Set data-mode for body background color in case CSS uses it
  const THEMES = {
    'slate-amber': 'dark',
    'midnight-coral': 'dark',
    'forest-gold': 'dark',
    'ink-sky': 'dark',
    'warm-cream': 'light',
    'monochrome': 'dark',
  };
  
  document.documentElement.setAttribute('data-mode', THEMES[saved] || 'dark');
  document.documentElement.classList.toggle('dark', THEMES[saved] === 'dark');
}

// Initialize immediately on page load
initializeTheme();
