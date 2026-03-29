/**
 * GET /health/readiness — unit tests
 */
import request from 'supertest';
import express from 'express';

jest.mock('../../lib/integrationStatus', () => ({
  getIntegrationSnapshot: jest.fn(),
}));
jest.mock('../../services/serviceFactory', () => ({
  getHealthService: jest.fn(),
  getHealthMonitor: jest.fn(),
  getAlertConfigService: jest.fn(),
}));

import { getIntegrationSnapshot } from '../../lib/integrationStatus';
import healthRouter from '../../routes/health';

const app = express();
app.use('/health', healthRouter);

describe('GET /health/readiness', () => {
  it('returns 503 with status=starting when snapshot is null', async () => {
    (getIntegrationSnapshot as jest.Mock).mockReturnValue(null);
    const res = await request(app).get('/health/readiness');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('starting');
  });

  it('returns 200 with status=ready when all integrations are enabled', async () => {
    (getIntegrationSnapshot as jest.Mock).mockReturnValue([
      { name: 'youtube', enabled: true },
      { name: 'stripe', enabled: true },
    ]);
    const res = await request(app).get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('returns 503 with status=degraded when any integration is disabled', async () => {
    (getIntegrationSnapshot as jest.Mock).mockReturnValue([
      { name: 'youtube', enabled: false, reason: 'YOUTUBE_CLIENT_ID not set' },
      { name: 'stripe', enabled: true },
    ]);
    const res = await request(app).get('/health/readiness');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.integrations).toHaveLength(2);
  });
});
