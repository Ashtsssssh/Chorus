const User = require('../models/User');

// Middleware to check if user is authenticated
async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Middleware to optionally load user if authenticated
async function optionalAuth(req, res, next) {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    next();
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
};
