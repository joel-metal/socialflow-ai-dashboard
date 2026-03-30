// Set required env vars before any module is imported
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars!!!!!';
process.env.TWITTER_BEARER_TOKEN = 'test-bearer-token';

// Mock the transitive dependency chain so only healthService.ts is exercised
jest.mock('../services/healthMonitor', () => ({ HealthMonitor: jest.fn() }));
jest.mock('../config/inversify.config', () => ({ TYPES: { HealthMonitor: Symbol('HealthMonitor') } }));

// Mock Prisma client
jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    $disconnect: jest.fn(),
  },
}));

// Mock Redis client
jest.mock('../lib/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    disconnect: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

import 'reflect-metadata';
import { HealthService } from '../services/healthService';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

function makeService(monitor?: any): HealthService {
  const svc = new HealthService();
  if (monitor) svc.setHealthMonitor(monitor);
  return svc;
}

describe('HealthService — real dependency probes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('returns healthy when database connection succeeds', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);

      const svc = makeService();
      const result = await svc.checkDatabase();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('returns degraded on first failure and unhealthy on third consecutive failure', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const svc = makeService();

      // First failure → degraded
      let result = await svc.checkDatabase();
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('Connection refused');

      // Second failure → degraded
      result = await svc.checkDatabase();
      expect(result.status).toBe('degraded');

      // Third failure → unhealthy
      result = await svc.checkDatabase();
      expect(result.status).toBe('unhealthy');
    });

    it('resets failure counter on successful probe', async () => {
      const svc = makeService();

      // Force 3 failures
      (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Failed'));
      await svc.checkDatabase();
      await svc.checkDatabase();
      await svc.checkDatabase();

      // Success resets counter
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '1': 1 }]);
      const result = await svc.checkDatabase();
      expect(result.status).toBe('healthy');

      // Next failure is degraded again (counter = 0 after success)
      (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Failed'));
      const nextResult = await svc.checkDatabase();
      expect(nextResult.status).toBe('degraded');
    });

    it('respects timeout setting', async () => {
      const svc = makeService();
      svc.setDependencyTimeout('database', 100); // 100ms timeout

      // Mock a slow query that times out
      (prisma.$queryRaw as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 500)),
      );

      const result = await svc.checkDatabase();
      expect(result.status).toBe('degraded');
      expect(result.error).toContain('timed out');
    });
  });

  describe('checkRedis', () => {
    it('returns healthy when redis ping succeeds', async () => {
      (redis.ping as jest.Mock).mockResolvedValue('PONG');

      const svc = makeService();
      const result = await svc.checkRedis();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(redis.ping).toHaveBeenCalled();
    });

    it('returns degraded on first failure', async () => {
      (redis.ping as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

      const svc = makeService();
      const result = await svc.checkRedis();

      expect(result.status).toBe('degraded');
      expect(result.error).toBe('Connection timeout');
    });

    it('becomes unhealthy after 3 consecutive failures', async () => {
      (redis.ping as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      const svc = makeService();
      let result;

      for (let i = 1; i <= 3; i++) {
        result = await svc.checkRedis();
        const expectedStatus = i < 3 ? 'degraded' : 'unhealthy';
        expect(result.status).toBe(expectedStatus);
      }
    });
  });

  describe('checkS3', () => {
    it('returns degraded when S3 is not configured', async () => {
      const originalAwsKey = process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_ACCESS_KEY_ID;

      try {
        const svc = makeService();
        const result = await svc.checkS3();

        expect(result.status).toBe('degraded');
        expect(result.error).toContain('not configured');
      } finally {
        process.env.AWS_ACCESS_KEY_ID = originalAwsKey;
      }
    });

    it('returns healthy when S3 bucket is accessible', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';

      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
      });

      const svc = makeService();
      const result = await svc.checkS3();

      expect(result.status).toBe('healthy');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('test-bucket'),
        expect.objectContaining({ method: 'HEAD' }),
      );
    });

    it('returns degraded when S3 bucket not configured', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      delete process.env.AWS_S3_BUCKET;

      const svc = makeService();
      const result = await svc.checkS3();

      expect(result.status).toBe('degraded');
      expect(result.error).toContain('AWS_S3_BUCKET');
    });

    it('accepts 403 and 404 as connectivity indicators', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';

      const svc = makeService();

      // 403 Forbidden
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 403, ok: false });
      let result = await svc.checkS3();
      expect(result.status).toBe('healthy');

      // 404 Not Found
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 404, ok: false });
      result = await svc.checkS3();
      expect(result.status).toBe('healthy');
    });

    it('returns unhealthy after 3 S3 failures', async () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const svc = makeService();
      let result;

      for (let i = 1; i <= 3; i++) {
        result = await svc.checkS3();
        const expectedStatus = i < 3 ? 'degraded' : 'unhealthy';
        expect(result.status).toBe(expectedStatus);
      }
    });
  });

  describe('checkTwitterAPI', () => {
    it('returns degraded when Twitter bearer token not configured', async () => {
      const originalToken = process.env.TWITTER_BEARER_TOKEN;
      delete process.env.TWITTER_BEARER_TOKEN;

      try {
        const svc = makeService();
        const result = await svc.checkTwitterAPI();

        expect(result.status).toBe('degraded');
        expect(result.error).toContain('not configured');
      } finally {
        process.env.TWITTER_BEARER_TOKEN = originalToken;
      }
    });

    it('returns healthy on successful API response', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'valid-bearer-token';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const svc = makeService();
      const result = await svc.checkTwitterAPI();

      expect(result.status).toBe('healthy');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-bearer-token',
          }),
        }),
      );
    });

    it('treats 401 Unauthorized as connectivity indicator', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'invalid-token';

      (global.fetch as jest.Mock).mockResolvedValue({
        status: 401,
        ok: false,
      });

      const svc = makeService();
      const result = await svc.checkTwitterAPI();

      expect(result.status).toBe('healthy');
    });

    it('returns degraded on rate limit (429)', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'valid-bearer-token';

      (global.fetch as jest.Mock).mockResolvedValue({
        status: 429,
        ok: false,
      });

      const svc = makeService();
      const result = await svc.checkTwitterAPI();

      expect(result.status).toBe('degraded');
      expect(result.error).toContain('rate limited');
    });

    it('returns unhealthy after 3 consecutive API failures', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'valid-bearer-token';

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const svc = makeService();
      let result;

      for (let i = 1; i <= 3; i++) {
        result = await svc.checkTwitterAPI();
        const expectedStatus = i < 3 ? 'degraded' : 'unhealthy';
        expect(result.status).toBe(expectedStatus);
      }
    });

    it('returns unhealthy on immediate network error', async () => {
      process.env.TWITTER_BEARER_TOKEN = 'valid-bearer-token';

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      const svc = makeService();
      const result = await svc.checkTwitterAPI();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('getSystemStatus', () => {
    it('returns healthy when all dependencies are healthy', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
      (redis.ping as jest.Mock).mockResolvedValue('PONG');
      (global.fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      const svc = makeService();
      const { overallStatus, dependencies } = await svc.getSystemStatus();

      expect(overallStatus).toBe('healthy');
      expect(dependencies.database.status).toBe('healthy');
      expect(dependencies.redis.status).toBe('healthy');
      expect(dependencies.s3.status).toBe('healthy');
      expect(dependencies.twitter.status).toBe('healthy');
    });

    it('returns degraded when one dependency is degraded', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
      (redis.ping as jest.Mock).mockRejectedValue(new Error('Connection failed'));
      (global.fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      const svc = makeService();
      const { overallStatus, dependencies } = await svc.getSystemStatus();

      expect(overallStatus).toBe('degraded');
      expect(dependencies.redis.status).toBe('degraded');
    });

    it('returns unhealthy when any dependency is unhealthy', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
      (redis.ping as jest.Mock).mockResolvedValue('PONG');
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API error'));

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      // Force multiple failures for Twitter to become unhealthy
      const svc = makeService();
      for (let i = 0; i < 3; i++) {
        await svc.checkTwitterAPI();
      }

      const { overallStatus, dependencies } = await svc.getSystemStatus();

      expect(overallStatus).toBe('unhealthy');
      expect(dependencies.twitter.status).toBe('unhealthy');
    });

    it('records metrics via healthMonitor when provided', async () => {
      const recordMetric = jest.fn().mockResolvedValue(undefined);
      const svc = makeService({ recordMetric } as any);

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
      (redis.ping as jest.Mock).mockResolvedValue('PONG');
      (global.fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      svc.setHealthMonitor({ recordMetric } as any);
      await svc.getSystemStatus();

      expect(recordMetric).toHaveBeenCalledTimes(4);
      expect(recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'database',
          status: 'healthy',
          errorRate: 0,
        }),
      );
      expect(recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'twitter',
          status: 'healthy',
          errorRate: 0,
        }),
      );
    });

    it('does not throw when no healthMonitor is set', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '1': 1 }]);
      (redis.ping as jest.Mock).mockResolvedValue('PONG');
      (global.fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      const svc = makeService();
      await expect(svc.getSystemStatus()).resolves.not.toThrow();
    });

    it('includes latency and error messages for all dependencies', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      (redis.ping as jest.Mock).mockResolvedValue('PONG');
      (global.fetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      process.env.TWITTER_BEARER_TOKEN = 'valid-token';

      const svc = makeService();
      const { dependencies } = await svc.getSystemStatus();

      expect(dependencies.database).toHaveProperty('latency');
      expect(dependencies.database).toHaveProperty('lastChecked');
      expect(dependencies.database).toHaveProperty('error', 'Connection refused');

      expect(dependencies.redis).toHaveProperty('latency');
      expect(dependencies.redis).not.toHaveProperty('error');
    });
  });

  describe('setDependencyTimeout', () => {
    it('allows customizing timeout for each dependency', async () => {
      const svc = makeService();

      svc.setDependencyTimeout('database', 1000);
      svc.setDependencyTimeout('redis', 500);

      // Verify the timeouts are enforced by checking that slow operations fail
      (prisma.$queryRaw as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 2000)),
      );

      const result = await svc.checkDatabase();
      expect(result.status).toBe('degraded');
      expect(result.error).toContain('timed out');
    });

    it('enforces minimum timeout of 100ms', async () => {
      const svc = makeService();

      // Try to set timeout below minimum
      svc.setDependencyTimeout('database', 50);

      (prisma.$queryRaw as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '1': 1 }]), 150)),
      );

      // Should use minimum 100ms, so this will timeout
      const result = await svc.checkDatabase();
      expect(result.status).toBe('degraded');
    });
  });
});
