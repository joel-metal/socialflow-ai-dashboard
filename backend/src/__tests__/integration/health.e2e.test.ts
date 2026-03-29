import './setup';
import request from 'supertest';
import app from '../../app';

describe('GET /health', () => {
  it('200 — returns ok status with timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /api/v1', () => {
  it('200 — returns version metadata', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 'v1', status: 'stable' });
  });
});

describe('GET /api/v1/health/status', () => {
  it('200 — returns system health', async () => {
    const res = await request(app).get('/api/v1/health/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overallStatus', 'healthy');
  });
});

describe('GET /api/v1/status', () => {
  it('200 — returns system status', async () => {
    const res = await request(app).get('/api/v1/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overallStatus');
  });
});

describe('404 handler', () => {
  it('404 — unknown route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
  });
});
