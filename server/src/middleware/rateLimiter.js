const rateLimit = require('express-rate-limit');

// General API rate limiter
// 1000 req / 15 min is generous enough for normal app usage (polling, fetches, etc.)
// The old limit of 100 was easily hit by the assembler alone (23 chunks = 23 fetches)
// plus dashboard polling every 2s.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth limiter — keep strict (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login/signup attempts, please try again after 15 minutes' },
  skipSuccessfulRequests: true,
});

// Chunk result-data fetcher — assembler fetches ALL chunks rapidly in parallel.
// This is expected and legitimate high-frequency traffic; give it its own generous limit.
const chunkResultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 500,            // 500 result fetches per minute per IP — enough for any job size
  message: { error: 'Chunk result fetch rate exceeded, slow down' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Job submission limiter
const jobSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many job submissions, please try again after 1 hour' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Chunk upload limiter
const chunkUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many chunk uploads, please try again after 15 minutes' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

module.exports = {
  apiLimiter,
  authLimiter,
  chunkResultLimiter,
  jobSubmitLimiter,
  chunkUploadLimiter,
};
