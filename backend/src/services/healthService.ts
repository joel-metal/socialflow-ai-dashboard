import 'reflect-metadata';
import { injectable, inject, optional } from 'inversify';
import { HealthMonitor } from './healthMonitor';
import { TYPES } from '../config/inversify.config';

@injectable()
class HealthService {
  private healthMonitor?: HealthMonitor;
  private failureCounters: Map<string, number> = new Map();
  /** Overridable for testing — defaults to Math.random */
  random: () => number = Math.random;
  /** Overridable for testing — defaults to current ISO timestamp */
  now: () => string = () => new Date().toISOString();

  constructor(@inject(TYPES.HealthMonitor) @optional() healthMonitor?: HealthMonitor) {
    this.healthMonitor = healthMonitor;
  }

  setHealthMonitor(monitor: HealthMonitor): void {
    this.healthMonitor = monitor;
  }

  /**
   * Helper function to simulate a latency check.
   */
  private simulateCheck(
    serviceName: string,
    baseLatency: number,
  ): { status: string; latency: number; lastChecked: string; errorRate: number } {
    const latency = baseLatency + Math.floor(this.random() * 20);

    // Simulate occasional unhealthy for Twitter
    const isUnhealthy = serviceName === 'twitter' && this.random() < 0.2;
    const errorRate = isUnhealthy ? this.random() * 30 : this.random() * 2;

    if (isUnhealthy) {
      const counter = (this.failureCounters.get(serviceName) || 0) + 1;
      this.failureCounters.set(serviceName, counter);
    } else {
      this.failureCounters.set(serviceName, 0);
    }

    return {
      status: isUnhealthy ? 'unhealthy' : 'healthy',
      latency,
      errorRate,
      lastChecked: this.now(),
    };
  }

  public checkDatabase() {
    return this.simulateCheck('database', 10);
  }

  public checkRedis() {
    return this.simulateCheck('redis', 5);
  }

  public checkS3() {
    return this.simulateCheck('s3', 15);
  }

  public checkTwitterAPI() {
    return this.simulateCheck('twitter', 50);
  }

  public async getSystemStatus() {
    const [database, redis, s3, twitter] = await Promise.all([
      Promise.resolve(this.checkDatabase()),
      Promise.resolve(this.checkRedis()),
      Promise.resolve(this.checkS3()),
      Promise.resolve(this.checkTwitterAPI()),
    ]);

    const dependencies = { database, redis, s3, twitter };

    const isUnhealthy = Object.values(dependencies).some((dep) => dep.status !== 'healthy');
    const overallStatus = isUnhealthy ? 'unhealthy' : 'healthy';

    // Record metrics for monitoring
    if (this.healthMonitor) {
      await Promise.all(
        Object.entries(dependencies).map(([service, metric]) =>
          this.healthMonitor!.recordMetric({
            service,
            status: metric.status as 'healthy' | 'unhealthy',
            latency: metric.latency,
            errorRate: metric.errorRate,
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
