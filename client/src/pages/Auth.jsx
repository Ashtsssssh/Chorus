import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { login, signup } from '../api/api.js';

// Move FormInput OUTSIDE the Auth component
const FormInput = ({ label, name, type = 'text', placeholder, error, hint, value, onChange, onFocus, onBlur, disabled, isFocused }) => (
  <div>
    <label style={{
      display: 'block',
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-label)',
      color: error ? 'var(--color-error, #ef4444)' : 'var(--color-text-tertiary)',
      marginBottom: 'var(--space-sm)',
    }}>
      {label}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      required
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '1rem',
        color: 'var(--color-text-primary)',
        background: 'transparent',
        border: 'none',
        borderBottom: `1px solid ${
          error 
            ? 'var(--color-error, #ef4444)' 
            : isFocused 
            ? 'var(--color-accent)' 
            : 'var(--color-border)'
        }`,
        padding: 'var(--space-sm) 0',
        width: '100%',
        transition: 'border-color 0.3s ease',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
    {error && (
      <p style={{
        fontSize: '0.875rem',
        color: 'var(--color-error, #ef4444)',
        margin: '0.5rem 0 0 0',
      }}>
        {error}
      </p>
    )}
    {hint && !error && (
      <p style={{
        fontSize: '0.875rem',
        color: 'var(--color-text-tertiary)',
        margin: '0.5rem 0 0 0',
      }}>
        {hint}
      </p>
    )}
  </div>
);

export default function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => {
      if (prev[name]) {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      }
      return prev;
    });
  }, []);

  const handleFocus = useCallback((e) => {
    setFocusedInput(e.target.name);
  }, []);

  const handleBlur = useCallback((e) => {
    setFocusedInput(null);
  }, []);

  const validateLogin = () => {
    const newErrors = {};
    if (!formData.usernameOrEmail.trim()) {
      newErrors.usernameOrEmail = 'Username or email is required';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    return newErrors;
  };

  const validateSignup = () => {
    const newErrors = {};
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = mode === 'login' ? validateLogin() : validateSignup();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

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

      toast.success(mode === 'login' ? 'Logged in successfully' : 'Account created successfully');
      setFormData({ usernameOrEmail: '', username: '', email: '', password: '', confirmPassword: '' });
      
      if (onAuthSuccess && data.user) {
        onAuthSuccess(data.user);
      }
    } catch (err) {
      const message = err.message || 'Authentication failed';
      toast.error(message);
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setFormData({ usernameOrEmail: '', username: '', email: '', password: '', confirmPassword: '' });
    setErrors({});
    setFocusedInput(null);
  };

  return (
    <>
      <Toaster position="top-center" theme="light" />
      
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
              fontSize: '0.875rem',
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

          <div style={{
            height: '1px',
            background: 'var(--color-border)',
            marginBottom: 'var(--space-3xl)',
          }} />

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

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)' }}
          >
            {mode === 'login' && (
              <FormInput
                label="Username or Email"
                name="usernameOrEmail"
                type="text"
                placeholder="Enter your username or email"
                error={errors.usernameOrEmail}
                value={formData.usernameOrEmail}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                isFocused={focusedInput === 'usernameOrEmail'}
                disabled={loading}
              />
            )}

            {mode === 'signup' && (
              <>
                <FormInput
                  label="Username"
                  name="username"
                  type="text"
                  placeholder="Choose a username"
                  error={errors.username}
                  hint="3-30 characters, lowercase"
                  value={formData.username}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  isFocused={focusedInput === 'username'}
                  disabled={loading}
                />
                <FormInput
                  label="Email Address"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  error={errors.email}
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  isFocused={focusedInput === 'email'}
                  disabled={loading}
                />
              </>
            )}

            <FormInput
              label="Password"
              name="password"
              type="password"
              placeholder="••••••••"
              error={errors.password}
              hint={mode === 'signup' ? 'Minimum 8 characters' : undefined}
              value={formData.password}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              isFocused={focusedInput === 'password'}
              disabled={loading}
            />

            {mode === 'signup' && (
              <FormInput
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                error={errors.confirmPassword}
                value={formData.confirmPassword}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                isFocused={focusedInput === 'confirmPassword'}
                disabled={loading}
              />
            )}

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
                borderRadius: '8px',
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
          </form>

          <div style={{
            height: '1px',
            background: 'var(--color-border)',
            margin: 'var(--space-3xl) 0',
          }} />

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
              onClick={toggleMode}
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