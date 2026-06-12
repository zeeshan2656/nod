const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_video_platform_123!@#';

/**
 * Middleware to authenticate requests via JWT
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
      return next();
    }
    req.user = user;
    next();
  });
};

/**
 * Enforces user authentication
 */
const requireAuth = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    next();
  });
};

/**
 * Enforces admin authorization
 */
const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden. Admin role required.' });
    }
    next();
  });
};

module.exports = {
  authenticateToken,
  requireAuth,
  requireAdmin
};
