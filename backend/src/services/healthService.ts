import 'reflect-metadata';
import { injectable, inject, optional } from 'inversify';
import { HealthMonitor } from './healthMonitor';
import { TYPES } from '../config/inversify.config';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';

const logger = createLogger('health-service');

/**
 * Per-dependency health check result with real metrics
 */
interface DependencyProbeResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastChecked: string;
  error?: string;
}

/**
 * Dependency timeout configuration in milliseconds
 */
interface TimeoutConfig {
  database: number;
  redis: number;
  s3: number;
  twitter: number;
}

/**
 * Helper function to execute a probe with timeout enforcement
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  serviceName: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${serviceName} health check timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

@injectable()
class HealthService {
  private healthMonitor?: HealthMonitor;
  private failureCounters: Map<string, number> = new Map();
  private readonly timeouts: TimeoutConfig = {
    database: 5000,     // 5s for DB connection
    redis: 2000,        // 2s for Redis
    s3: 8000,           // 8s for S3 operations
    twitter: 10000,     // 10s for external APIs
  };

  constructor(@inject(TYPES.HealthMonitor) @optional() healthMonitor?: HealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  setHealthMonitor(monitor: HealthMonitor): void {
    this.healthMonitor = monitor;
  }

  /**
   * Set custom timeout for a specific dependency
   * Useful for testing or environment-specific tuning
   */
  public setDependencyTimeout(dependency: keyof TimeoutConfig, timeoutMs: number): void {
    this.timeouts[dependency] = Math.max(timeoutMs, 100); // Enforce minimum 100ms
  }

  /**
   * Probe database connectivity by executing a simple query
   */
  private async probeDatabase(): Promise<DependencyProbeResult> {
    const startTime = Date.now();

    try {
      await executeWithTimeout(
        () => prisma.$queryRaw`SELECT 1`,
        this.timeouts.database,
        'database',
      );

      this.failureCounters.set('database', 0);
      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const consecutiveFailures = (this.failureCounters.get('database') || 0) + 1;
      this.failureCounters.set('database', consecutiveFailures);

      // Unhealthy if 3+ consecutive failures, degraded otherwise
      const status = consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger.warn('Database probe failed', {
        latency,
        consecutiveFailures,
        status,
        error: errorMsg,
      });

      return {
        status,
        latency,
        lastChecked: new Date().toISOString(),
        error: errorMsg,
      };
    }
  }

  /**
   * Probe Redis connectivity using PING command
   */
  private async probeRedis(): Promise<DependencyProbeResult> {
    const startTime = Date.now();

    try {
      await executeWithTimeout(
        () => redis.ping(),
        this.timeouts.redis,
        'redis',
      );

      this.failureCounters.set('redis', 0);
      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const consecutiveFailures = (this.failureCounters.get('redis') || 0) + 1;
      this.failureCounters.set('redis', consecutiveFailures);

      const status = consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger.warn('Redis probe failed', {
        latency,
        consecutiveFailures,
        status,
        error: errorMsg,
      });

      return {
        status,
        latency,
        lastChecked: new Date().toISOString(),
        error: errorMsg,
      };
    }
  }

  /**
   * Probe S3 connectivity by attempting to verify bucket access
   * Gracefully handles unconfigured S3 environments
   */
  private async probeS3(): Promise<DependencyProbeResult> {
    const startTime = Date.now();

    // Check if S3 is configured
    const hasS3Config = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

    if (!hasS3Config) {
      return {
        status: 'degraded',
        latency: 0,
        lastChecked: new Date().toISOString(),
        error: 'S3 not configured (AWS credentials missing)',
      };
    }

    try {
      // Attempt a basic S3 health check by making a signed request
      // This is a lightweight check that doesn't require AWS SDK imports
      const s3Endpoint = process.env.AWS_S3_ENDPOINT || 'https://s3.amazonaws.com';
      const s3Bucket = process.env.AWS_S3_BUCKET;

      if (!s3Bucket) {
        return {
          status: 'degraded',
          latency: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
          error: 'S3 bucket not configured (AWS_S3_BUCKET)',
        };
      }

      // Execute a basic HEAD request to S3 bucket
      const response = await executeWithTimeout(
        () =>
          fetch(`${s3Endpoint}/${s3Bucket}`, {
            method: 'HEAD',
            timeout: this.timeouts.s3,
          }),
        this.timeouts.s3,
        's3',
      );

      // Accept 200, 403 (forbidden), and 404 (not found) as connectivity indicators
      if (response.status === 200 || response.status === 403 || response.status === 404) {
        this.failureCounters.set('s3', 0);
        return {
          status: 'healthy',
          latency: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
        };
      }

      throw new Error(`S3 returned unexpected status: ${response.status}`);
    } catch (error) {
      const latency = Date.now() - startTime;
      const consecutiveFailures = (this.failureCounters.get('s3') || 0) + 1;
      this.failureCounters.set('s3', consecutiveFailures);

      const status = consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger.warn('S3 probe failed', {
        latency,
        consecutiveFailures,
        status,
        error: errorMsg,
      });

      return {
        status,
        latency,
        lastChecked: new Date().toISOString(),
        error: errorMsg,
      };
    }
  }

  /**
   * Probe external API connectivity (Twitter as reference)
   * Uses lightweight endpoint checks only. Does not record real API calls.
   */
  private async probeTwitterAPI(): Promise<DependencyProbeResult> {
    const startTime = Date.now();

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    if (!bearerToken || bearerToken === 'your_twitter_bearer_token') {
      return {
        status: 'degraded',
        latency: 0,
        lastChecked: new Date().toISOString(),
        error: 'Twitter API not configured (bearer token missing or placeholder)',
      };
    }

    try {
      // Lightweight API connectivity test: fetch user info endpoint
      // This endpoint has lower rate limits and is suitable for health checks
      const response = await executeWithTimeout(
        () =>
          fetch('https://api.twitter.com/2/users/me', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${bearerToken}`,
            },
          }),
        this.timeouts.twitter,
        'twitter',
      );

      // Accept 200 (authenticated) and 401 (bad auth) as connectivity indicators
      // 403 (forbidden) and other errors suggest API is reachable
      if (response.ok || response.status === 401 || response.status === 403) {
        this.failureCounters.set('twitter', 0);
        return {
          status: 'healthy',
          latency: Date.now() - startTime,
          lastChecked: new Date().toISOString(),
        };
      }

      // Rate limited or service error
      const isRateLimited = response.status === 429;
      const status = isRateLimited ? 'degraded' : 'unhealthy';

      throw new Error(`Twitter API returned ${response.status}${isRateLimited ? ' (rate limited)' : ''}`);
    } catch (error) {
      const latency = Date.now() - startTime;
      const consecutiveFailures = (this.failureCounters.get('twitter') || 0) + 1;
      this.failureCounters.set('twitter', consecutiveFailures);

      const errorMsg = error instanceof Error ? error.message : String(error);
      const isNetworkError = errorMsg.includes('Network') || errorMsg.includes('timeout');
      const status = consecutiveFailures >= 3 || isNetworkError ? 'unhealthy' : 'degraded';

      logger.warn('Twitter API probe failed', {
        latency,
        consecutiveFailures,
        status,
        error: errorMsg,
      });

      return {
        status,
        latency,
        lastChecked: new Date().toISOString(),
        error: errorMsg,
      };
    }
  }

  public async checkDatabase() {
    return this.probeDatabase();
  }

  public async checkRedis() {
    return this.probeRedis();
  }

  public async checkS3() {
    return this.probeS3();
  }

  public async checkTwitterAPI() {
    return this.probeTwitterAPI();
  }

  public async getSystemStatus() {
    const [database, redis, s3, twitter] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeS3(),
      this.probeTwitterAPI(),
    ]);

    const dependencies = { database, redis, s3, twitter };

    // Determine overall system status
    const unhealthyCount = Object.values(dependencies).filter((dep) => dep.status === 'unhealthy').length;
    const degradedCount = Object.values(dependencies).filter((dep) => dep.status === 'degraded').length;
    const overallStatus = unhealthyCount > 0 ? 'unhealthy' : degradedCount > 0 ? 'degraded' : 'healthy';

    // Record metrics for monitoring
    if (this.healthMonitor) {
      await Promise.all(
        Object.entries(dependencies).map(([service, metric]) =>
          this.healthMonitor!.recordMetric({
            service,
            status: metric.status as 'healthy' | 'unhealthy',
            latency: metric.latency,
            errorRate: 0, // No longer using simulated error rates
            consecutiveFailures: this.failureCounters.get(service) || 0,
            lastChecked: metric.lastChecked,
          }),
        ),
      );
    }

    return {
      dependencies,
      overallStatus,
    };
  }
}

export { HealthService };
