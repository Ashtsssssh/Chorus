import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
import './styles/App.css';
import Submitter from './pages/Submitter';
import Worker from './pages/Worker';
import Auth from './pages/Auth';
import UserPanel from './components/UserPanel';
import JobList from './pages/JobList';
import MyJobs from './pages/MyJobs';
import UploadedJobDashboard from './pages/UploadedJobDashboard';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { checkAuth, getCurrentUser, logout } from './api/api.js';

/**
 * ROUTING: URL-based navigation with React Router
 * - /           → Browse jobs
 * - /my-jobs    → My submitted jobs
 * - /submit     → Submit a new job (full page)
 * - /job/:jobId → Process job as a worker
 * - /job/:jobId/view → View uploaded job dashboard
 */

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUserPanel, setShowUserPanel] = useState(false);

  useEffect(() => {
    runAuthCheck();
  }, []);

  const runAuthCheck = async () => {
    try {
      const data = await checkAuth();
      if (data.authenticated) {
        const userData = await getCurrentUser();
        if (userData?.user) setUser(userData.user);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setShowUserPanel(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{ background: 'var(--color-bg)' }}
        className="min-h-screen flex items-center justify-center"
      >
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
          Loading
        </p>
      </motion.div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  const isActive = (path) => location.pathname === path;

  const NavLink = ({ label, href }) => (
    <button
      onClick={() => navigate(href)}
      style={{
        fontSize: '0.875rem',
        fontWeight: 600,
        color: isActive(href) ? 'var(--color-surface)' : 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '0.5rem 1rem',
        background: isActive(href) ? 'var(--color-text-primary)' : 'transparent',
        border: isActive(href) ? '1px solid var(--color-text-primary)' : '1px solid var(--color-border)',
        borderRadius: '8px',
        transition: 'all var(--transition-fast)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <Toaster position="top-center" theme="light" />

      <div style={{ background: 'var(--color-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Fixed Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 'var(--z-fixed)',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
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
              <div style={{ display: 'flex', gap: 'var(--space-3xl)', alignItems: 'center' }}>
                <NavLink label="Browse" href="/" />
                <NavLink label="My Work" href="/my-jobs" />
              </div>

              {/* Right Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'center' }}>
                <ThemeSwitcher />

                <div style={{ width: '1px', height: '1.5rem', background: 'var(--color-border)' }} />

                {/* Submit Job Button → dedicated /submit page */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/submit')}
                  style={{
                    background: isActive('/submit') ? 'var(--color-accent-hover)' : 'var(--color-accent)',
                    color: 'white',
                    padding: '0.625rem 1.25rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    transition: 'background-color var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'var(--color-accent-hover)'; }}
                  onMouseLeave={(e) => { e.target.style.background = isActive('/submit') ? 'var(--color-accent-hover)' : 'var(--color-accent)'; }}
                >
                  Submit
                </motion.button>

                {/* User Menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowUserPanel(!showUserPanel)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '0.875rem',
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
                element={
                  <JobList
                    onSelectJob={() => {}}
                    onStartProcessing={(job) => navigate(`/job/${job.id}`)}
                  />
                }
              />

              {/* My Jobs */}
              <Route path="/my-jobs" element={<MyJobs user={user} />} />

              {/* Submit a new job */}
              <Route
                path="/submit"
                element={
                  <Submitter
                    user={user}
                    onJobSubmitted={(jobId) => navigate(`/job/${jobId}/view`)}
                  />
                }
              />

              {/* View Uploaded Job Dashboard */}
              <Route path="/job/:jobId/view" element={<UploadedJobDashboard />} />

              {/* Process Job as Worker */}
              <Route
                path="/job/:jobId"
                element={
                  <div>
                    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'var(--space-lg)' }}>
                      <button
                        onClick={() => navigate('/')}
                        className="btn-secondary"
                        style={{ marginBottom: 'var(--space-lg)' }}
                      >
                        ← Back to Browse
                      </button>
                    </div>
                    <Worker />
                  </div>
                }
              />
            </Routes>
          </motion.div>
        </main>
      </div>
    </>
  );
}
