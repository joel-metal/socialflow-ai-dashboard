import 'reflect-metadata';
import { createLogger } from '../lib/logger';
import { getHealthService } from '../services/serviceFactory';

const logger = createLogger('healthMonitoringJob');

let healthMonitoringInterval: NodeJS.Timeout | null = null;

export async function startHealthMonitoringJob(): Promise<void> {
  const intervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '300000', 10); // 5 minutes

  healthMonitoringInterval = setInterval(async () => {
    try {
      logger.debug('Running health check...');
      const healthService = getHealthService();
      await healthService.getSystemStatus();
    } catch (error) {
      logger.error('Health monitoring job failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, intervalMs);

  logger.info('Health monitoring job started', { intervalMs });
}

export async function stopHealthMonitoringJob(): Promise<void> {
  if (healthMonitoringInterval) {
    clearInterval(healthMonitoringInterval);
    healthMonitoringInterval = null;
    logger.info('Health monitoring job stopped');
  }
}
