import './setup';
import request from 'supertest';
import app from '../../app';
import { UserStore } from '../../models/User';

afterEach(() => {
  (UserStore as any).users = new Map();
});

// ── Register ──────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  it('201 — returns access and refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'user@example.com', password: 'SecurePass1!' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('409 — duplicate email', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@example.com', password: 'SecurePass1!' });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@example.com', password: 'SecurePass1!' });
    expect(res.status).toBe(409);
  });

  it('422 — invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'SecurePass1!' });
    expect(res.status).toBe(422);
  });

  it('422 — missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'nopass@example.com' });
    expect(res.status).toBe(422);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'login@example.com', password: 'ValidPass1!' });
  });

  it('200 — valid credentials return tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'ValidPass1!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('401 — wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'WrongPass!' });
    expect(res.status).toBe(401);
  });

  it('401 — unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'ValidPass1!' });
    expect(res.status).toBe(401);
  });
});

// ── Refresh ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/refresh', () => {
  let refreshToken: string;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'refresh@example.com', password: 'ValidPass1!' });
    refreshToken = res.body.refreshToken;
  });

  it('200 — issues new tokens and rotates refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('401 — invalid refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });

  it('401 — reused (rotated-out) refresh token', async () => {
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  it('204 — revokes token; subsequent refresh returns 401', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'logout@example.com', password: 'ValidPass1!' });
    const { refreshToken } = reg.body;

    expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });
});
