const rateLimit = require('express-rate-limit');

// Auth endpoints (login, signup, forgot/reset password) — tighter, since brute-forcing credentials
// or spamming password-reset emails is the specific risk here.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// Rest of the API — generous, just a backstop against runaway clients or scripts, not brute-force protection.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, generalLimiter };
