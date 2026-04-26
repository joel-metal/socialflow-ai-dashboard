import { Worker } from 'bullmq';
import { getConfiguredQueueNames, getNumber, getRedisConnection } from '../config/runtime';
import { WorkerMonitor } from './workerMonitor';
import { createLogger } from '../lib/logger';
import { createNotificationManager } from '../services/notificationProvider';

const logger = createLogger('worker-monitor');
const redisConnection = getRedisConnection();
const notificationManager = createNotificationManager();

const queueNames = getConfiguredQueueNames();

const workerMonitor = new WorkerMonitor({
  connection: redisConnection,
  monitorIntervalMs: getNumber(process.env.WORKER_MONITOR_INTERVAL_MS, 30000),
  latencyThresholdMs: getNumber(process.env.WORKER_MONITOR_LATENCY_THRESHOLD_MS, 60000),
  stuckJobThresholdMs: getNumber(process.env.WORKER_MONITOR_STUCK_THRESHOLD_MS, 300000),
  maxRestartsPerHour: getNumber(process.env.WORKER_MONITOR_MAX_RESTARTS_PER_HOUR, 3),
  maxRecoveryAttempts: getNumber(process.env.WORKER_MONITOR_MAX_RECOVERY_ATTEMPTS, 5),
  alertHandler: async (alert) => {
    const details = {
      code: alert.code,
      ...(alert.metadata ?? {}),
    };

    await notificationManager.sendAlert({
      severity: alert.severity,
      service: 'worker-monitor',
      message: alert.message,
      details,
      timestamp: alert.timestamp,
    });

    logger.warn('Worker monitor alert', { alert });
  },
});

for (const queueName of queueNames) {
  workerMonitor.registerQueue(queueName);
}

export const registerMonitoredWorker = (
  workerName: string,
  queueName: string,
  workerFactory: () => Worker,
): void => {
  workerMonitor.registerWorker(workerName, queueName, workerFactory);
};

export const startWorkerMonitor = async (): Promise<void> => {
  await workerMonitor.start();
};

export const stopWorkerMonitor = async (): Promise<void> => {
  await workerMonitor.stop();
};

export const getWorkerMonitorStatus = () => {
  return workerMonitor.getStatus();
};
