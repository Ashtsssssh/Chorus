import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import './styles/App.css';
import Submitter from './pages/Submitter';
import Worker from './pages/Worker';
import Auth from './pages/Auth';
import UserPanel from './components/UserPanel';
import JobList from './pages/JobList';
import MyJobs from './pages/MyJobs';
import SubmitterModal from './components/SubmitterModal';
import UploadedJobDashboard from './pages/UploadedJobDashboard';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { checkAuth, getCurrentUser, logout } from './api/api.js';

/**
 * Error Boundary Component
 * Catches component errors and displays fallback UI
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          padding: 'var(--space-lg)',
          textAlign: 'center',
        }}>
          <h1 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-lg)' }}>
            Something went wrong
          </h1>
          <p style={{ color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2xl)' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              background: 'var(--color-accent)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              borderRadius: '2px',
            }}
          >
            Return to Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Main App Component
 * Production hardened with:
 * - Auth check with exponential backoff retry
 * - Error boundary for crash handling
 * - Proper cleanup on unmount
 * - Accessibility attributes
 * - Loading states
 * 
 * ROUTING:
 * - / → Browse jobs
 * - /my-jobs → My work
 * - /job/:jobId → Process job
 * - ?modal=submit → Submit modal overlay
 */

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [showUserPanel, setShowUserPanel] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const authRetryRef = useRef(0);
  const authAbortRef = useRef(null);

  // Determine if submit modal is open from URL query params
  const params = new URLSearchParams(location.search);
  const showUploadModal = params.get('modal') === 'submit';

  /**
   * Run auth check with exponential backoff retry
   * Prevents infinite retry loops with max 3 attempts
   */
  const runAuthCheck = useCallback(async () => {
    // Cancel previous request if any
    if (authAbortRef.current) {
      authAbortRef.current.abort();
    }

    const controller = new AbortController();
    authAbortRef.current = controller;

    try {
      const data = await checkAuth();
      
      if (!isMountedRef.current) return;

      if (data?.authenticated) {
        try {
          const userData = await getCurrentUser();
          if (isMountedRef.current && userData?.user) {
            setUser(userData.user);
            setAuthError(null);
            authRetryRef.current = 0;
          }
        } catch (err) {
          console.warn('[Auth] Failed to fetch user:', err.message);
          // Auth check passed but user fetch failed - not critical
          if (isMountedRef.current) {
            setAuthError(null); // Don't block on user data fetch
          }
        }
      } else {
        setAuthError(null);
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      console.error('[Auth] Check failed:', err.message);

      if (!isMountedRef.current) return;

      // Exponential backoff retry: 1s, 2s, 4s (max 3 attempts)
      if (authRetryRef.current < 3) {
        const delayMs = Math.pow(2, authRetryRef.current) * 1000;
        authRetryRef.current += 1;

        console.log(`[Auth] Retrying in ${delayMs}ms (attempt ${authRetryRef.current}/3)`);
        
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            runAuthCheck();
          }
        }, delayMs);

        return () => clearTimeout(timeoutId);
      } else {
        // Max retries reached
        setAuthError('Failed to verify authentication. Please refresh the page.');
        console.error('[Auth] Max retries reached');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * Initialize auth check on mount
   */
  useEffect(() => {
    isMountedRef.current = true;

    runAuthCheck();

    return () => {
      isMountedRef.current = false;
      // Cancel in-flight requests
      if (authAbortRef.current) {
        authAbortRef.current.abort();
      }
    };
  }, [runAuthCheck]);

  /**
   * Handle successful authentication
   */
  const handleAuthSuccess = useCallback((userData) => {
    if (isMountedRef.current) {
      setUser(userData);
      setAuthError(null);
      authRetryRef.current = 0;
      toast.success('Logged in successfully');
    }
  }, []);

  /**
   * Handle logout
   */
  const handleLogout = async () => {
    try {
      await logout();
      if (isMountedRef.current) {
        setUser(null);
        setShowUserPanel(false);
        toast.success('Logged out successfully');
      }
    } catch (err) {
      console.error('[Auth] Logout failed:', err.message);
      toast.error('Logout failed');
    }
  };

  /**
   * Loading state
   */
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ background: 'var(--color-bg)' }}
        className="min-h-screen flex items-center justify-center"
      >
        <p style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
        }}>
          Loading
        </p>
      </motion.div>
    );
  }

  /**
   * Auth error state
   */
  if (authError) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ background: 'var(--color-bg)' }}
        className="min-h-screen flex items-center justify-center p-4"
      >
        <div style={{
          maxWidth: '480px',
          textAlign: 'center',
        }}>
          <h2 style={{
            color: 'var(--color-text-primary)',
            fontSize: '1.5rem',
            marginBottom: 'var(--space-lg)',
          }}>
            Authentication Error
          </h2>
          <p style={{
            color: 'var(--color-text-tertiary)',
            marginBottom: 'var(--space-2xl)',
            lineHeight: '1.6',
          }}>
            {authError}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--color-accent)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              borderRadius: '2px',
            }}
          >
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  /**
   * Not authenticated - show auth page
   */
  if (!user) {
    return (
      <ErrorBoundary>
        <Auth onAuthSuccess={handleAuthSuccess} />
      </ErrorBoundary>
    );
  }

  /**
   * Navigation Link Component
   */
  const NavLink = ({ label, active, href }) => (
    <button
      onClick={() => navigate(href)}
      className="btn-secondary"
      aria-current={active ? 'page' : undefined}
      style={{
        fontSize: '0.75rem',
        fontWeight: 500,
        color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '0.5rem 0',
        borderBottom: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
        transition: 'all var(--transition-fast)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const isActive = (path) => location.pathname === path;

  return (
    <ErrorBoundary>
      <>
        <Toaster position="top-center" theme="light" />

        <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Luxury Fixed Navigation */}
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            role="navigation"
            aria-label="Main navigation"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              backdropFilter: 'blur(10px)',
              transition: 'var(--theme-transition)',
            }}
          >
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 var(--space-lg)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  height: '4rem',
                }}
              >
                {/* Logo */}
                <button
                  onClick={() => navigate('/')}
                  aria-label="Chorus home"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.25rem',
                      fontWeight: 400,
                      color: 'var(--color-text-primary)',
                      letterSpacing: 'var(--tracking-heading)',
                    }}
                  >
                    Chorus
                  </span>
                  <span
                    style={{
                      fontSize: '0.5rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    WASM
                  </span>
                </button>

                {/* Center Navigation Links */}
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3xl)',
                    alignItems: 'center',
                  }}
                >
                  <NavLink
                    label="Browse"
                    active={isActive('/')}
                    href="/"
                  />
                  <NavLink
                    label="My Work"
                    active={isActive('/my-jobs')}
                    href="/my-jobs"
                  />
                </div>

                {/* Right Actions */}
                <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'center' }}>
                  {/* Theme Switcher */}
                  <ThemeSwitcher />

                  {/* Divider */}
                  <div style={{
                    width: '1px',
                    height: '1.5rem',
                    background: 'var(--color-border)',
                  }} />

                  {/* Upload Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/?modal=submit')}
                    aria-label="Open submit job dialog"
                    style={{
                      background: 'var(--color-accent)',
                      color: 'white',
                      padding: '0.625rem 1.25rem',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '1px',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--color-accent-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--color-accent)';
                    }}
                  >
                    Submit
                  </motion.button>

                  {/* User Menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowUserPanel(!showUserPanel)}
                      aria-label="User menu"
                      aria-expanded={showUserPanel}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#10b981',
                        }}
                        aria-hidden="true"
                      />
                      {user.username}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.nav>

          {/* User Panel Dropdown */}
          {showUserPanel && (
            <UserPanel
              user={user}
              onLogout={handleLogout}
              onClose={() => setShowUserPanel(false)}
            />
          )}

          {/* Upload Modal - Overlay on current page */}
          {showUploadModal && (
            <SubmitterModal
              user={user}
              isOpen={showUploadModal}
              onClose={() => navigate(location.pathname)}
              onJobSubmitted={(jobId) => {
                navigate(`/job/${jobId}/view`);
              }}
            />
          )}

          {/* Main Content Area */}
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              paddingTop: '4rem',
            }}
          >
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              style={{ flex: 1 }}
            >
              <Routes>
                {/* Browse Jobs */}
                <Route
                  path="/"
                  element={<JobList />}
                />

                {/* My Jobs */}
                <Route
                  path="/my-jobs"
                  element={<MyJobs user={user} />}
                />

                {/* View Uploaded Job Dashboard */}
                <Route
                  path="/job/:jobId/view"
                  element={<UploadedJobDashboard />}
                />

                {/* Process Job as Worker */}
                <Route
                  path="/job/:jobId"
                  element={
                    <div>
                      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'var(--space-lg)' }}>
                        <button
                          onClick={() => navigate('/')}
                          className="btn-secondary"
                          aria-label="Back to job list"
                          style={{
                            marginBottom: 'var(--space-lg)',
                          }}
                        >
                          ← Back to Browse
                        </button>
                      </div>
                      <Worker />
                    </div>
                  }
                />

                {/* Submitter Page (if needed directly) */}
                <Route
                  path="/submit"
                  element={<Submitter user={user} />}
                />
              </Routes>
            </motion.div>
          </main>
        </div>
      </>
    </ErrorBoundary>
  );
}
