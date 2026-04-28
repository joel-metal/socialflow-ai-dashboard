/**
 * #614 — CSRF protection for state-changing auth endpoints
 *
 * Tests cover:
 *  - Cross-origin requests are rejected (403)
 *  - Same-origin requests are allowed (pass-through)
 *  - Bearer-token clients bypass the check (mobile / API clients)
 *  - Referer header used as fallback when Origin is absent
 *  - Missing origin: allowed in non-production, rejected in production
 */

// Set required env vars before any module is loaded
process.env.JWT_SECRET = 'test-secret-csrf';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-csrf';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

import { Request, Response, NextFunction } from 'express';
import { csrfProtection } from '../middleware/csrfProtection';

jest.mock('../lib/logger', () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/auth/login',
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ── Unit tests for the middleware function ────────────────────────────────────

describe('csrfProtection middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test'; // non-production by default
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ── Bearer-token bypass ───────────────────────────────────────────────────

  describe('Bearer-token clients (API / mobile)', () => {
    it('passes through when Authorization: Bearer header is present — any origin', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({
        headers: {
          authorization: 'Bearer some.jwt.token',
          origin: 'https://evil.example.com',
        },
      });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('passes through when Authorization: Bearer header is present — no origin', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { authorization: 'Bearer some.jwt.token' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ── Allowed origins ───────────────────────────────────────────────────────

  describe('same-origin requests (allowed)', () => {
    it('allows http://localhost:3000', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'http://localhost:3000' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows http://localhost:5173 (Vite dev server)', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'http://localhost:5173' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows http://127.0.0.1:3000', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'http://127.0.0.1:3000' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ── Cross-origin rejection ────────────────────────────────────────────────

  describe('cross-origin requests (blocked)', () => {
    it('rejects an unknown external origin with 403', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'https://evil.example.com' } });
      const { res, status, json } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ message: 'CSRF check failed: origin not allowed' });
    });

    it('rejects a subdomain of an allowed origin', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'https://sub.socialflow.app' } });
      const { res, status } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });

    it('rejects http:// variant of an https-only allowed origin', () => {
      process.env.NODE_ENV = 'production';
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'http://socialflow.app' } });
      const { res, status } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });
  });

  // ── Referer fallback ──────────────────────────────────────────────────────

  describe('Referer header fallback (no Origin header)', () => {
    it('allows a request whose Referer matches an allowed origin', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({
        headers: { referer: 'http://localhost:3000/login' },
      });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects a request whose Referer is from a disallowed origin', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({
        headers: { referer: 'https://attacker.example.com/csrf-page' },
      });
      const { res, status } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });

    it('rejects a request with an unparseable Referer in production', () => {
      process.env.NODE_ENV = 'production';
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { referer: 'not-a-url' } });
      const { res, status } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });
  });

  // ── Missing origin ────────────────────────────────────────────────────────

  describe('missing Origin and Referer headers', () => {
    it('allows the request in non-production (server-to-server / tooling)', () => {
      process.env.NODE_ENV = 'development';
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: {} });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows the request in test environment', () => {
      process.env.NODE_ENV = 'test';
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: {} });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects the request in production with 403', () => {
      process.env.NODE_ENV = 'production';
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: {} });
      const { res, status, json } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ message: 'CSRF check failed: missing origin' });
    });
  });

  // ── Production allowed origins ────────────────────────────────────────────

  describe('production allowed origins', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('allows https://socialflow.app', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'https://socialflow.app' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows https://www.socialflow.app', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'https://www.socialflow.app' } });
      const { res } = makeRes();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects localhost in production', () => {
      const next = jest.fn() as unknown as NextFunction;
      const req = makeReq({ headers: { origin: 'http://localhost:3000' } });
      const { res, status } = makeRes();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });
  });
});

// ── Integration tests via supertest ──────────────────────────────────────────
// Use a minimal Express app that mounts only the auth router + CSRF middleware
// to avoid the pre-existing generalLimiter async-init issue in the full app.

import request from 'supertest';
import express from 'express';
import authRouter from '../routes/auth';
import { csrfProtection as csrfMiddleware } from '../middleware/csrfProtection';

// Mock rate-limit and AuthBlacklistService so the auth router works in isolation
jest.mock('../middleware/rateLimit', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return { generalLimiter: pass, authLimiter: pass, aiLimiter: pass };
});

jest.mock('../services/AuthBlacklistService', () => ({
  AuthBlacklistService: {
    keyFromPayload: jest.fn(() => 'key'),
    isBlacklisted: jest.fn(async () => false),
    blacklistToken: jest.fn(async () => {}),
    accessTokenTTL: jest.fn(() => 900),
  },
}));

jest.mock('../services/PasswordHistoryService', () => ({
  PasswordHistoryService: {
    isRotationRequired: jest.fn(async () => false),
    isPasswordReused: jest.fn(async () => false),
    hashPassword: jest.fn(async (p: string) => p),
    recordPasswordChange: jest.fn(async () => {}),
  },
}));

function buildTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/api/auth', csrfMiddleware, authRouter);
  return testApp;
}

describe('#614 CSRF protection on /api/auth/* (integration)', () => {
  const testApp = buildTestApp();
  const loginPayload = { email: 'csrf-test@example.com', password: 'ValidPass1!' };

  beforeAll(async () => {
    // Register a user so login tests have a valid account to hit
    await request(testApp)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send(loginPayload);
  });

  describe('POST /api/auth/login', () => {
    it('allows a same-origin browser request', async () => {
      const res = await request(testApp)
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send(loginPayload);

      expect(res.status).toBe(200);
    });

    it('rejects a cross-origin request with 403', async () => {
      const res = await request(testApp)
        .post('/api/auth/login')
        .set('Origin', 'https://evil.example.com')
        .send(loginPayload);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/CSRF/i);
    });

    it('allows a Bearer-token request regardless of origin (mobile / API client)', async () => {
      // Register a fresh user to get a token
      const reg = await request(testApp)
        .post('/api/auth/register')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'csrf-mobile@example.com', password: 'ValidPass1!' });

      const { refreshToken } = reg.body;

      // Refresh using Bearer auth from a "cross-origin" context — must succeed
      const res = await request(testApp)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .set('Origin', 'https://evil.example.com')
        .send({ refreshToken });

      // The CSRF check is bypassed; the actual handler validates the token
      expect(res.status).not.toBe(403);
    });
  });

  describe('POST /api/auth/register', () => {
    it('rejects a cross-origin registration attempt', async () => {
      const res = await request(testApp)
        .post('/api/auth/register')
        .set('Origin', 'https://phishing.example.com')
        .send({ email: 'attacker@example.com', password: 'ValidPass1!' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('rejects a cross-origin logout attempt', async () => {
      const res = await request(testApp)
        .post('/api/auth/logout')
        .set('Origin', 'https://evil.example.com')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rejects a cross-origin token refresh attempt', async () => {
      const res = await request(testApp)
        .post('/api/auth/refresh')
        .set('Origin', 'https://evil.example.com')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(403);
    });
  });

  describe('Referer fallback (no Origin header)', () => {
    it('allows a request with a matching Referer', async () => {
      const res = await request(testApp)
        .post('/api/auth/login')
        .set('Referer', 'http://localhost:3000/login')
        .send(loginPayload);

      // CSRF passes; actual handler responds (200 or 401 depending on credentials)
      expect(res.status).not.toBe(403);
    });

    it('rejects a request with a cross-origin Referer', async () => {
      const res = await request(testApp)
        .post('/api/auth/login')
        .set('Referer', 'https://attacker.example.com/csrf')
        .send(loginPayload);

      expect(res.status).toBe(403);
    });
  });
});
