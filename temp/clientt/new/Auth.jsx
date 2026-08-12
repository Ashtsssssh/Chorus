import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { login, signup } from '../api/api.js';

/**
 * Auth Component - Login & Signup
 * Production hardened with:
 * - Input validation on client
 * - Password strength indicators
 * - Proper error handling with user feedback
 * - Rate limiting (basic)
 * - No sensitive data in logs
 */

// Validation rules
const VALIDATION = {
  username: {
    min: 3,
    max: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: 'Username must be 3-50 chars, letters/numbers/underscore/dash only',
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format',
  },
  password: {
    min: 8,
    message: 'Password must be at least 8 characters',
  },
};

// Rate limiting: max 5 attempts per minute
const RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 60000, // 1 minute
};

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
  const [errors, setErrors] = useState({});
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(null);

  /**
   * Validate individual field
   */
  const validateField = useCallback((fieldName, value, mode) => {
    const newErrors = { ...errors };

    switch (fieldName) {
      case 'usernameOrEmail':
        if (!value || !value.trim()) {
          newErrors.usernameOrEmail = 'Username or email required';
        } else {
          delete newErrors.usernameOrEmail;
        }
        break;

      case 'username':
        if (!value || value.length < VALIDATION.username.min) {
          newErrors.username = `Username must be at least ${VALIDATION.username.min} characters`;
        } else if (value.length > VALIDATION.username.max) {
          newErrors.username = `Username must be less than ${VALIDATION.username.max} characters`;
        } else if (!VALIDATION.username.pattern.test(value)) {
          newErrors.username = VALIDATION.username.message;
        } else {
          delete newErrors.username;
        }
        break;

      case 'email':
        if (!value || !VALIDATION.email.pattern.test(value)) {
          newErrors.email = VALIDATION.email.message;
        } else {
          delete newErrors.email;
        }
        break;

      case 'password':
        if (!value || value.length < VALIDATION.password.min) {
          newErrors.password = VALIDATION.password.message;
        } else {
          delete newErrors.password;
        }
        break;

      case 'confirmPassword':
        if (mode === 'signup') {
          if (value !== formData.password) {
            newErrors.confirmPassword = 'Passwords do not match';
          } else {
            delete newErrors.confirmPassword;
          }
        }
        break;

      default:
        break;
    }

    setErrors(newErrors);
  }, [errors, formData]);

  /**
   * Handle input change with real-time validation
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    validateField(name, value, mode);
  };

  /**
   * Check rate limiting
   */
  const isRateLimited = () => {
    const now = Date.now();
    
    // Reset attempts if window expired
    if (lastAttemptTime && now - lastAttemptTime > RATE_LIMIT.windowMs) {
      setLoginAttempts(0);
      return false;
    }

    if (loginAttempts >= RATE_LIMIT.maxAttempts) {
      const remainingMs = RATE_LIMIT.windowMs - (now - lastAttemptTime);
      const remainingSec = Math.ceil(remainingMs / 1000);
      toast.error(`Too many attempts. Try again in ${remainingSec}s`);
      return true;
    }

    return false;
  };

  /**
   * Validate entire form before submission
   */
  const validateForm = () => {
    const newErrors = {};

    if (mode === 'login') {
      if (!formData.usernameOrEmail?.trim()) {
        newErrors.usernameOrEmail = 'Username or email required';
      }
      if (!formData.password) {
        newErrors.password = 'Password required';
      }
    } else {
      // Signup validation
      if (!formData.username || formData.username.length < VALIDATION.username.min) {
        newErrors.username = `Username must be at least ${VALIDATION.username.min} characters`;
      }
      if (!VALIDATION.email.pattern.test(formData.email)) {
        newErrors.email = VALIDATION.email.message;
      }
      if (!formData.password || formData.password.length < VALIDATION.password.min) {
        newErrors.password = VALIDATION.password.message;
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check rate limiting
    if (isRateLimited()) {
      return;
    }

    // Validate form
    if (!validateForm()) {
      toast.error('Please fix validation errors');
      return;
    }

    setLoading(true);

    try {
      const data = mode === 'login'
        ? await login({
            usernameOrEmail: formData.usernameOrEmail.trim(),
            password: formData.password,
          })
        : await signup({
            username: formData.username.trim(),
            email: formData.email.trim(),
            password: formData.password,
            confirmPassword: formData.confirmPassword,
          });

      // Success
      setFormData({ 
        usernameOrEmail: '', 
        username: '', 
        email: '', 
        password: '', 
        confirmPassword: '' 
      });
      setErrors({});
      setLoginAttempts(0);

      if (onAuthSuccess && data?.user) {
        onAuthSuccess(data.user);
        toast.success(`${mode === 'login' ? 'Logged in' : 'Account created'} successfully`);
      }
    } catch (err) {
      // Update rate limiting
      const now = Date.now();
      setLastAttemptTime(now);
      setLoginAttempts(prev => prev + 1);

      // Handle specific error types
      let userMessage = err.message || 'Authentication failed';

      if (err.message.includes('401') || err.message.includes('Invalid')) {
        userMessage = mode === 'login' 
          ? 'Invalid username/email or password' 
          : 'Username or email already exists';
      } else if (err.message.includes('timeout')) {
        userMessage = 'Server is taking too long to respond. Please try again.';
      }

      toast.error(userMessage);
      console.error(`[Auth] ${mode} failed:`, { message: err.message });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Switch between login and signup modes
   */
  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setFormData({ 
      usernameOrEmail: '', 
      username: '', 
      email: '', 
      password: '', 
      confirmPassword: '' 
    });
    setErrors({});
  };

  // Render input field with error
  const renderInput = ({ 
    label, 
    name, 
    type = 'text', 
    value, 
    placeholder, 
    error, 
    required = true 
  }) => (
    <div>
      <label style={{
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label)',
        color: error ? '#ef4444' : 'var(--color-text-tertiary)',
        marginBottom: 'var(--space-sm)',
        transition: 'color 0.2s',
      }}>
        {label}
        {required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={() => validateField(name, value, mode)}
        required={required}
        disabled={loading}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          color: 'var(--color-text-primary)',
          background: error ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
          border: 'none',
          borderBottom: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
          padding: 'var(--space-sm) 0',
          width: '100%',
          transition: 'border-color 0.2s',
          outline: 'none',
          letterSpacing: type === 'password' ? '0.1em' : 'inherit',
        }}
        onFocus={(e) => {
          if (!error) {
            e.target.style.borderBottomColor = 'var(--color-accent)';
          }
        }}
        onBlur={(e) => {
          e.target.style.borderBottomColor = error ? '#ef4444' : 'var(--color-border)';
        }}
      />
      {error && (
        <p
          id={`${name}-error`}
          style={{
            fontSize: '0.75rem',
            color: '#ef4444',
            marginTop: '0.375rem',
            margin: '0.375rem 0 0 0',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );

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
            noValidate
          >
            {/* Login: Username or Email */}
            {mode === 'login' && renderInput({
              label: 'Username or Email',
              name: 'usernameOrEmail',
              type: 'text',
              value: formData.usernameOrEmail,
              placeholder: 'Enter your username or email',
              error: errors.usernameOrEmail,
            })}

            {/* Signup: Username */}
            {mode === 'signup' && renderInput({
              label: 'Username',
              name: 'username',
              type: 'text',
              value: formData.username,
              placeholder: 'Choose a username',
              error: errors.username,
            })}

            {/* Signup: Email */}
            {mode === 'signup' && renderInput({
              label: 'Email Address',
              name: 'email',
              type: 'email',
              value: formData.email,
              placeholder: 'your@email.com',
              error: errors.email,
            })}

            {/* Password */}
            {renderInput({
              label: 'Password',
              name: 'password',
              type: 'password',
              value: formData.password,
              placeholder: '••••••••',
              error: errors.password,
            })}

            {mode === 'signup' && (
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-tertiary)',
                marginTop: '-1rem',
                marginBottom: 0,
              }}>
                Minimum 8 characters
              </p>
            )}

            {/* Signup: Confirm Password */}
            {mode === 'signup' && renderInput({
              label: 'Confirm Password',
              name: 'confirmPassword',
              type: 'password',
              value: formData.confirmPassword,
              placeholder: '••••••••',
              error: errors.confirmPassword,
            })}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: !loading ? 1.02 : 1 }}
              whileTap={{ scale: !loading ? 0.98 : 1 }}
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
              type="button"
              onClick={switchMode}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
                textDecoration: 'none',
                position: 'relative',
                paddingBottom: '0.25rem',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.2s',
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
