import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { login, signup } from '../api/api.js';


export default function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = mode === 'login'
        ? await login({
            usernameOrEmail: formData.usernameOrEmail,
            password: formData.password,
          })
        : await signup({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            confirmPassword: formData.confirmPassword,
          });

      setFormData({ usernameOrEmail: '', username: '', email: '', password: '', confirmPassword: '' });
      
      if (onAuthSuccess) {
        onAuthSuccess(data.user);
      }
    } catch (err) {
      toast.error(err.message || 'Authentication failed');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" theme="light" />
      
      {/* Decorative Blob */}
      <div
        className="blob"
        style={{
          width: '400px',
          height: '400px',
          top: '-100px',
          right: '-100px',
        }}
      />
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg)', position: 'relative', zIndex: 1 }}
      >
        <div style={{ maxWidth: '480px', width: '100%', padding: 'var(--space-lg)' }}>
          {/* Logo / Wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-12"
          >
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.5rem',
              fontWeight: 300,
              margin: 0,
              letterSpacing: 'var(--tracking-heading)',
              color: 'var(--color-text-primary)',
            }}>
              Chorus
            </h1>
            <p style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-label)',
              color: 'var(--color-text-tertiary)',
              marginTop: '0.5rem',
              margin: 0,
            }}>
              Distributed Task Computing Platform
            </p>
          </motion.div>

          {/* Divider */}
          <div style={{
            height: '1px',
            background: 'var(--color-border)',
            marginBottom: 'var(--space-3xl)',
          }} />

          {/* Form Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.875rem',
              fontWeight: 400,
              margin: '0 0 0.5rem 0',
              color: 'var(--color-text-primary)',
            }}>
              {mode === 'login' ? 'Access Your Account' : 'Create Account'}
            </h2>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: 'var(--color-text-tertiary)',
              lineHeight: '1.6',
            }}>
              {mode === 'login'
                ? 'Enter your credentials to continue'
                : 'Provide your details to get started'
              }
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)' }}
          >
            {/* Login: Username or Email */}
            {mode === 'login' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-label)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  Username or Email
                </label>
                <input
                  type="text"
                  name="usernameOrEmail"
                  value={formData.usernameOrEmail}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="Enter your username or email"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--color-text-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    padding: 'var(--space-sm) 0',
                    width: '100%',
                    transition: 'border-color 0.3s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
                />
              </div>
            )}

            {/* Signup: Username */}
            {mode === 'signup' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-label)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="Choose a username"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--color-text-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    padding: 'var(--space-sm) 0',
                    width: '100%',
                    transition: 'border-color 0.3s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
                />
              </div>
            )}

            {/* Signup: Email */}
            {mode === 'signup' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-label)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="your@email.com"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--color-text-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    padding: 'var(--space-sm) 0',
                    width: '100%',
                    transition: 'border-color 0.3s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-label)',
                color: 'var(--color-text-tertiary)',
                marginBottom: 'var(--space-sm)',
              }}>
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                placeholder="••••••••"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  color: 'var(--color-text-primary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  padding: 'var(--space-sm) 0',
                  width: '100%',
                  transition: 'border-color 0.3s ease',
                  outline: 'none',
                  letterSpacing: '0.1em',
                }}
                onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
                onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
              />
              {mode === 'signup' && (
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '0.5rem',
                  margin: '0.5rem 0 0 0',
                }}>
                  Minimum 8 characters
                </p>
              )}
            </div>

            {/* Signup: Confirm Password */}
            {mode === 'signup' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-label)',
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--color-text-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    padding: 'var(--space-sm) 0',
                    width: '100%',
                    transition: 'border-color 0.3s ease',
                    outline: 'none',
                    letterSpacing: '0.1em',
                  }}
                  onFocus={(e) => e.target.style.borderBottomColor = 'var(--color-accent)'}
                  onBlur={(e) => e.target.style.borderBottomColor = 'var(--color-border)'}
                />
              </div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                background: 'var(--color-accent)',
                color: 'white',
                padding: 'var(--space-lg)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.3s ease',
                marginTop: 'var(--space-lg)',
                borderRadius: '1px',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.target.style.background = 'var(--color-accent-hover)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'var(--color-accent)';
              }}
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </motion.button>
          </motion.form>

          {/* Divider */}
          <div style={{
            height: '1px',
            background: 'var(--color-border)',
            margin: 'var(--space-3xl) 0',
          }} />

          {/* Toggle Mode */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            style={{ textAlign: 'center' }}
          >
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-tertiary)',
              margin: '0 0 var(--space-sm) 0',
            }}>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </p>
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setFormData({ usernameOrEmail: '', username: '', email: '', password: '', confirmPassword: '' });
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
                textDecoration: 'none',
                position: 'relative',
                paddingBottom: '0.25rem',
              }}
              className="btn-primary"
            >
              {mode === 'login' ? 'Sign up here' : 'Sign in here'}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}
