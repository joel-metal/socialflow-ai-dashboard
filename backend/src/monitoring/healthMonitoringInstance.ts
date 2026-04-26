import 'reflect-metadata';
import { container, TYPES } from '../config/inversify.config';
import { HealthMonitor } from '../services/healthMonitor';
import { HealthService } from '../services/healthService';
import { createLogger } from '../lib/logger';

const logger = createLogger('healthMonitoringInstance');

export function getHealthMonitor(): HealthMonitor {
  return container.get<HealthMonitor>(TYPES.HealthMonitor);
}

export function initializeHealthMonitoring(): void {
  const _monitor = getHealthMonitor();
  const _healthService = container.get<HealthService>(TYPES.HealthService);
  logger.info('Health monitoring initialized with DI container');
}
