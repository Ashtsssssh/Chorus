const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { validators, ValidationError } = require('../middleware/validation');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Input validation with detailed error messages
    try {
      validators.username(username);
      validators.email(email);
      validators.password(password, 8);
    } catch (validationErr) {
      return res.status(400).json({
        error: validationErr.message,
        field: validationErr.field,
      });
    }

    // Password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Passwords do not match. Please ensure both password fields are identical.',
        field: 'confirmPassword',
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      if (existingUser.username === username.toLowerCase()) {
        return res.status(409).json({
          error: `Username "${username}" is already taken. Please choose a different username.`,
          field: 'username',
        });
      }
      return res.status(409).json({
        error: `Email "${email}" is already registered. Please try a different email or use login instead.`,
        field: 'email',
      });
    }

    // Create user
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
    });

    await user.save();

    // Create session
    req.session.userId = user._id.toString();
    req.session.username = user.username;

    res.status(201).json({
      message: 'Account created successfully',
      user: user.toPublic(),
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again later.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    // Input validation
    if (!usernameOrEmail) {
      return res.status(400).json({
        error: 'Username or email is required',
        field: 'usernameOrEmail',
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'Password is required',
        field: 'password',
      });
    }

    // Search by username or email
    const user = await User.findOne({
      $or: [
        { username: usernameOrEmail.toLowerCase() },
        { email: usernameOrEmail.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({
        error: 'No account found with this username or email. Please check and try again.',
        field: 'usernameOrEmail',
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Incorrect password. Please try again.',
        field: 'password',
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create session
    req.session.userId = user._id.toString();
    req.session.username = user.username;

    res.json({
      message: 'Logged in successfully',
      user: user.toPublic(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

// GET /api/auth/check
router.get('/check', (req, res) => {
  if (req.session.userId) {
    res.json({ authenticated: true, username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
