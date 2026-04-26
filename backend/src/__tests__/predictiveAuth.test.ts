process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars!!!!!';
process.env.TWITTER_API_KEY = 'test-key';
process.env.TWITTER_API_SECRET = 'test-secret';

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import predictiveRouter from '../routes/predictive';

// Minimal app — only mounts the predictive router
const app = express();
app.use(express.json());
app.use('/api/v1/predictive', predictiveRouter);

const validToken = jwt.sign({ sub: 'user-1' }, 'test-secret', { expiresIn: '15m' });

jest.mock('../middleware/rateLimit', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return { generalLimiter: pass, authLimiter: pass, aiLimiter: pass };
});

jest.mock('../services/AuthBlacklistService', () => ({
  AuthBlacklistService: { keyFromPayload: jest.fn(() => 'key'), isBlacklisted: jest.fn(async () => false) },
}));

describe('Predictive routes — 401 for unauthenticated requests', () => {
  it('POST /reach returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/predictive/reach').send({ content: 'hello', platform: 'instagram' });
    expect(res.status).toBe(401);
  });

  it('GET /history/:postId returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/predictive/history/abc');
    expect(res.status).toBe(401);
  });

  it('GET /metrics returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/predictive/metrics');
    expect(res.status).toBe(401);
  });

  it('GET /metrics returns 401 with malformed Authorization header', async () => {
    const res = await request(app).get('/api/v1/predictive/metrics').set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });

  it('GET /metrics returns 401 with invalid token', async () => {
    const res = await request(app).get('/api/v1/predictive/metrics').set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });
});

describe('Predictive routes — authenticated requests succeed', () => {
  it('GET /metrics returns 200 with valid token', async () => {
    const res = await request(app).get('/api/v1/predictive/metrics').set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accuracy');
    expect(res.body.data).toHaveProperty('version');
  });
});
