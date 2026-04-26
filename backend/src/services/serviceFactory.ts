import 'reflect-metadata';
import { container, TYPES } from '../config/inversify.config';
import { HealthService } from './healthService';
import { HealthMonitor } from './healthMonitor';
import { NotificationManager } from './notificationProvider';
import { AlertConfigService } from './alertConfigService';

// Service factory for backward compatibility
export function getHealthService(): HealthService {
  return container.get<HealthService>(TYPES.HealthService);
}

export function getHealthMonitor(): HealthMonitor {
  return container.get<HealthMonitor>(TYPES.HealthMonitor);
}

export function getNotificationManager(): NotificationManager {
  return container.get<NotificationManager>(TYPES.NotificationManager);
}

export function getAlertConfigService(): AlertConfigService {
  return container.get<AlertConfigService>(TYPES.AlertConfigService);
}

// Singleton instances for backward compatibility
export const healthService = getHealthService();
export const alertConfigService = getAlertConfigService();
