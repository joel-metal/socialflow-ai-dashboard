// Set env vars before any module is loaded
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { authenticate } from '../middleware/authenticate';
import { UserStore } from '../models/User';
import { resetLimiters } from '../middleware/rateLimit';
import { Request, Response } from 'express';

// Register a protected test route once at module load time
app.get('/api/test/protected', authenticate, (_req: Request, res: Response) =>
  res.json({ ok: true }),
);

// ─── Global teardown ─────────────────────────────────────────────────────────
// Reset in-memory rate-limit counters and user store after every test so that
// counter state from one case cannot cause unexpected 429s in later cases.
afterEach(() => {
  resetLimiters();
  UserStore.clear();
});

// ─── Password hashing ────────────────────────────────────────────────────────

describe('bcrypt password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await bcrypt.hash('MyP@ssw0rd!', 12);
    expect(await bcrypt.compare('MyP@ssw0rd!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await bcrypt.hash('correct', 12);
    expect(await bcrypt.compare('wrong', hash)).toBe(false);
  });

  it('produces a different hash each time (salt)', async () => {
    const h1 = await bcrypt.hash('same', 12);
    const h2 = await bcrypt.hash('same', 12);
    expect(h1).not.toBe(h2);
  });
});

// ─── Token generation ────────────────────────────────────────────────────────

describe('JWT token generation', () => {
  const secret = 'test-secret';

  it('signs and verifies an access token', () => {
    const token = jwt.sign({ sub: 'user-1' }, secret, { expiresIn: '15m' });
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    expect(payload.sub).toBe('user-1');
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret', { expiresIn: '15m' });
    expect(() => jwt.verify(token, secret)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-1' }, secret, { expiresIn: '-1s' });
    expect(() => jwt.verify(token, secret)).toThrow(/expired/i);
  });
});

// ─── Registration ────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'SecurePass1!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'SecurePass1!' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'SecurePass1!' });

    expect(res.status).toBe(409);
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'SecurePass1!' });

    expect(res.status).toBe(422);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'carol@example.com', password: 'short' });

    expect(res.status).toBe(422);
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dave@example.com', password: 'ValidPass1!' });
  });

  it('returns tokens for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'ValidPass1!' });

    expect(res.status).toBe(401);
  });
});

// ─── Token refresh ───────────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  let refreshToken: string;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'eve@example.com', password: 'ValidPass1!' });
    refreshToken = res.body.refreshToken;
  });

  it('issues new tokens for a valid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    // Token rotation: new refresh token must differ from the old one
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' });

    expect(res.status).toBe(401);
  });

  it('rejects a reused (rotated-out) refresh token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'frank@example.com', password: 'ValidPass1!' });
    const oldToken = reg.body.refreshToken;

    // Use it once — rotates it out
    await request(app).post('/api/auth/refresh').send({ refreshToken: oldToken });

    // Attempt to reuse the old token
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: oldToken });

    expect(res.status).toBe(401);
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and returns 204', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'grace@example.com', password: 'ValidPass1!' });
    const { refreshToken } = reg.body;

    const res = await request(app).post('/api/auth/logout').send({ refreshToken });

    expect(res.status).toBe(204);

    // Token should no longer work
    const retry = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(retry.status).toBe(401);
  });
});

// ─── AuthMiddleware ──────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  it('allows requests with a valid Bearer token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'henry@example.com', password: 'ValidPass1!' });

    const res = await request(app)
      .get('/api/test/protected')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/test/protected');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed token', async () => {
    const res = await request(app)
      .get('/api/test/protected')
      .set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

// ─── UserStore ───────────────────────────────────────────────────────────────

describe('UserStore', () => {
  it('creates and retrieves a user by id and email', () => {
    const user = UserStore.create({
      id: 'test-id',
      email: 'store@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      refreshTokens: [],
    });

    expect(UserStore.findById('test-id')).toEqual(user);
    expect(UserStore.findByEmail('store@example.com')).toEqual(user);
  });

  it('updates a user', () => {
    UserStore.create({
      id: 'upd-id',
      email: 'upd@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      refreshTokens: [],
    });

    const updated = UserStore.update('upd-id', { refreshTokens: ['tok'] });
    expect(updated?.refreshTokens).toContain('tok');
  });

  it('returns undefined for unknown id', () => {
    expect(UserStore.findById('ghost')).toBeUndefined();
  });
});

// ─── #607 JWT undefined-secret guard ─────────────────────────────────────────

describe('#607 signAccess / signRefresh throw when secret is falsy', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalRefreshSecret = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    process.env.JWT_REFRESH_SECRET = originalRefreshSecret;
    jest.resetModules();
  });

  it('signAccess throws when JWT_SECRET is undefined', async () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();
    const { register } = await import('../controllers/auth');
    const req = {
      body: { email: 'guard1@example.com', password: 'SecurePass1!' },
      ip: '127.0.0.1',
      headers: {},
    } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    await expect(register(req, res)).rejects.toThrow('JWT_SECRET is not configured');
  });

  it('signRefresh throws when JWT_REFRESH_SECRET is undefined', async () => {
    delete process.env.JWT_REFRESH_SECRET;
    jest.resetModules();
    const { register } = await import('../controllers/auth');
    const req = {
      body: { email: 'guard2@example.com', password: 'SecurePass1!' },
      ip: '127.0.0.1',
      headers: {},
    } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    await expect(register(req, res)).rejects.toThrow('JWT_REFRESH_SECRET is not configured');
  });
});

// ─── #608 Refresh token blacklisting ─────────────────────────────────────────

describe('#608 consumed refresh token is blacklisted after rotation', () => {
  let refreshToken: string;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'replay1@example.com', password: 'ValidPass1!' });
    refreshToken = res.body.refreshToken;
  });

  it('replayed refresh token returns 401 after rotation', async () => {
    // First use — valid rotation
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);

    // Replay the original token — must be rejected
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
  });
});
