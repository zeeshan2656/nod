const rateLimit = require('express-rate-limit');

// Generic API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // Limit each IP to 150 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP, please try again after a minute.'
  }
});

// Stricter Auth and Upload Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per 15 minutes (2 requests/min average)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication or upload attempts, please try again after 15 minutes.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter
};
