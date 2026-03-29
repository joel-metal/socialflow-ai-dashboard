// Set required env vars before any module is imported
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars!!!!!';
process.env.TWITTER_API_KEY = 'test-key';
process.env.TWITTER_API_SECRET = 'test-secret';

// Mock the transitive dependency chain so only healthService.ts is exercised
jest.mock('../services/healthMonitor', () => ({ HealthMonitor: jest.fn() }));
jest.mock('../config/inversify.config', () => ({ TYPES: { HealthMonitor: Symbol('HealthMonitor') } }));

import 'reflect-metadata';
import { HealthService } from '../services/healthService';

const FIXED_NOW = '2026-03-28T11:51:39.970Z';

/**
 * Build a HealthService with a controlled random sequence and fixed clock.
 *
 * Call pattern per service (short-circuit matters!):
 *   non-twitter: 2 calls — [latency, errorRate]
 *   twitter:     3 calls — [latency, isUnhealthy, errorRate]
 * getSystemStatus order: database, redis, s3, twitter → indices 0-1, 2-3, 4-5, 6-8
 */
function makeService(randomValues: number[], monitor?: any): HealthService {
  let idx = 0;
  const svc = new HealthService();
  svc.random = () => randomValues[idx++ % randomValues.length];
  svc.now = () => FIXED_NOW;
  if (monitor) svc.setHealthMonitor(monitor);
  return svc;
}

describe('HealthService — deterministic unit tests', () => {
  describe('checkDatabase / checkRedis / checkS3', () => {
    it('returns healthy with correct latency and errorRate', () => {
      // random() = 0.5 → latency = 10 + floor(0.5*20) = 20; errorRate = 0.5*2 = 1
      const svc = makeService([0.5, 0.5]);
      expect(svc.checkDatabase()).toEqual({
        status: 'healthy',
        latency: 20,
        errorRate: 1,
        lastChecked: FIXED_NOW,
      });
    });

    it('non-twitter services are always healthy regardless of random values', () => {
      const svc = makeService([0.1, 0.1]);
      expect(svc.checkRedis().status).toBe('healthy');
      expect(svc.checkS3().status).toBe('healthy');
    });
  });

  describe('checkTwitterAPI', () => {
    it('returns healthy when isUnhealthy call >= 0.2', () => {
      // [latency=0.0→50, isUnhealthy=0.5→healthy, errorRate=0.3→0.6]
      const svc = makeService([0.0, 0.5, 0.3]);
      const result = svc.checkTwitterAPI();
      expect(result.status).toBe('healthy');
      expect(result.latency).toBe(50);
      expect(result.errorRate).toBeCloseTo(0.6);
    });

    it('returns unhealthy when isUnhealthy call < 0.2', () => {
      // [latency=0.0→50, isUnhealthy=0.1→unhealthy, errorRate=0.5→15]
      const svc = makeService([0.0, 0.1, 0.5]);
      const result = svc.checkTwitterAPI();
      expect(result.status).toBe('unhealthy');
      expect(result.errorRate).toBeCloseTo(15);
    });

    it('increments failure counter on consecutive unhealthy calls and resets on healthy', () => {
      const unhealthySeq = [0.0, 0.1, 0.5];
      const svc = makeService(unhealthySeq);
      svc.checkTwitterAPI(); // counter = 1
      svc.checkTwitterAPI(); // counter = 2
      expect(svc.checkTwitterAPI().status).toBe('unhealthy'); // counter = 3

      // healthy call resets counter; next unhealthy starts from 1
      const svc2 = makeService([0.0, 0.5, 0.3, 0.0, 0.1, 0.5]);
      svc2.checkTwitterAPI(); // healthy → counter = 0
      expect(svc2.checkTwitterAPI().status).toBe('unhealthy'); // counter = 1
    });
  });

  describe('getSystemStatus', () => {
    // Call layout: database[0,1], redis[2,3], s3[4,5], twitter[6,7,8]
    // twitter isUnhealthy is at index 7

    it('returns overall healthy when all services are healthy', async () => {
      // twitter isUnhealthy call (index 7) = 0.5 >= 0.2 → healthy
      const svc = makeService([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0]);
      const { overallStatus, dependencies } = await svc.getSystemStatus();
      expect(overallStatus).toBe('healthy');
      expect(Object.values(dependencies).every((d) => d.status === 'healthy')).toBe(true);
    });

    it('returns overall unhealthy when twitter is unhealthy', async () => {
      // twitter isUnhealthy call (index 7) = 0.1 < 0.2 → unhealthy
      const svc = makeService([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.5]);
      const { overallStatus, dependencies } = await svc.getSystemStatus();
      expect(overallStatus).toBe('unhealthy');
      expect(dependencies.twitter.status).toBe('unhealthy');
    });

    it('records metrics via healthMonitor when provided', async () => {
      const recordMetric = jest.fn().mockResolvedValue(undefined);
      const svc = makeService([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0], { recordMetric });
      await svc.getSystemStatus();
      expect(recordMetric).toHaveBeenCalledTimes(4);
      expect(recordMetric).toHaveBeenCalledWith(expect.objectContaining({ service: 'database' }));
      expect(recordMetric).toHaveBeenCalledWith(expect.objectContaining({ service: 'twitter' }));
    });

    it('skips monitor recording when no healthMonitor is set', async () => {
      const svc = makeService([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0]);
      await expect(svc.getSystemStatus()).resolves.not.toThrow();
    });
  });
});
