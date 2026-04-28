/**
 * Mock for src/middleware/rateLimit.ts used by the unit test project.
 *
 * Returns synchronous pass-through middleware so that routes can be
 * registered without waiting for the async initRateLimiters() promise,
 * and exposes resetLimiters() as a no-op (the real reset is exercised
 * in integration tests where the actual middleware is loaded).
 */
'use strict';

const passThrough = (_req, _res, next) => next();

module.exports = {
  authLimiter: passThrough,
  aiLimiter: passThrough,
  generalLimiter: passThrough,
  initRateLimiters: () => Promise.resolve(),
  resetLimiters: () => {},
};
