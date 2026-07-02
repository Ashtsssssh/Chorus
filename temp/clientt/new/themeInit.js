/**
 * Theme Initialization Utility
 * Run on page load (before React mounts) to prevent flash of wrong theme
 * Production hardened with error handling and sensible defaults
 */

const DEFAULT_THEME = 'slate-amber';
const STORAGE_KEY = 'app-theme';

/**
 * Theme to dark/light mode mapping
 */
const THEME_MODES = {
  'slate-amber': 'dark',
  'midnight-coral': 'dark',
  'forest-gold': 'dark',
  'ink-sky': 'dark',
  'warm-cream': 'light',
  'monochrome': 'dark',
};

/**
 * Initialize theme before React mounts
 * Call this in index.html <script> before React root render
 */
export function initializeTheme() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    // Get saved theme from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    const theme = (saved && typeof saved === 'string') ? saved : DEFAULT_THEME;

    // Validate theme is valid
    const isValidTheme = Object.keys(THEME_MODES).includes(theme);
    const finalTheme = isValidTheme ? theme : DEFAULT_THEME;

    // Apply theme attribute to root element
    const root = document.documentElement;
    root.setAttribute('data-theme', finalTheme);

    // Apply dark/light mode
    const mode = THEME_MODES[finalTheme] || 'dark';
    root.setAttribute('data-mode', mode);

    // Add dark class if dark mode
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Store for future use if it wasn't already saved
    if (!isValidTheme) {
      localStorage.setItem(STORAGE_KEY, finalTheme);
    }

  } catch (err) {
    // Fail silently - localStorage might be disabled, just use defaults
    console.warn('[themeInit] Initialization warning:', err.message);

    // Still apply default theme
    const root = document.documentElement;
    root.setAttribute('data-theme', DEFAULT_THEME);
    root.setAttribute('data-mode', THEME_MODES[DEFAULT_THEME]);
    root.classList.add('dark');
  }
}

/**
 * Switch to a different theme
 * @param {string} themeName - Theme name from THEME_MODES
 * @returns {boolean} Success status
 */
export function switchTheme(themeName) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Validate theme exists
  if (!Object.keys(THEME_MODES).includes(themeName)) {
    console.error(`[themeInit] Invalid theme: ${themeName}`);
    return false;
  }

  try {
    const root = document.documentElement;
    const mode = THEME_MODES[themeName];

    // Update attributes
    root.setAttribute('data-theme', themeName);
    root.setAttribute('data-mode', mode);

    // Update dark class
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Persist to localStorage
    localStorage.setItem(STORAGE_KEY, themeName);

    return true;

  } catch (err) {
    console.error('[themeInit] Theme switch failed:', err.message);
    return false;
  }
}

/**
 * Get current theme
 * @returns {string} Current theme name
 */
export function getCurrentTheme() {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && Object.keys(THEME_MODES).includes(saved)) {
      return saved;
    }
  } catch (err) {
    console.warn('[themeInit] Get theme warning:', err.message);
  }

  return DEFAULT_THEME;
}

/**
 * Get current mode (dark or light)
 * @returns {string} 'dark' or 'light'
 */
export function getCurrentMode() {
  const theme = getCurrentTheme();
  return THEME_MODES[theme] || 'dark';
}

/**
 * Get all available themes
 * @returns {Array<string>} Theme names
 */
export function getAvailableThemes() {
  return Object.keys(THEME_MODES);
}

/**
 * Check if current mode is dark
 * @returns {boolean}
 */
export function isDarkMode() {
  return getCurrentMode() === 'dark';
}

/**
 * Detect system preference for dark mode
 * @returns {boolean} True if system prefers dark
 */
export function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true; // Default to dark
  }

  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true; // Default to dark on error
  }
}

/**
 * Initialize to system preference if no saved theme
 */
export function initializeToSystemPreference() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    // Only initialize if no saved preference
    if (!saved) {
      const prefersDark = getSystemPrefersDark();
      const theme = prefersDark ? 'slate-amber' : 'warm-cream';
      switchTheme(theme);
    }

  } catch (err) {
    console.warn('[themeInit] System preference initialization warning:', err.message);
  }
}

// Initialize theme immediately when module loads (before React)
// This prevents flash of unstyled content
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    // If DOM is still loading, run when ready
    document.addEventListener('DOMContentLoaded', initializeTheme, { once: true });
  } else {
    // If DOM is already ready, initialize now
    initializeTheme();
  }
}

export default {
  initializeTheme,
  switchTheme,
  getCurrentTheme,
  getCurrentMode,
  getAvailableThemes,
  isDarkMode,
  getSystemPrefersDark,
  initializeToSystemPreference,
};
