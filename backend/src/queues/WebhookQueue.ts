import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '../lib/logger';
import { attemptDelivery } from '../services/WebhookDispatcher';
import { getRedisConnection } from '../config/runtime';

const logger = createLogger('WebhookQueue');

const connection = getRedisConnection();

export interface WebhookJobData {
  deliveryId: string;
  url: string;
  secret: string;
  payload: string;
  attempt: number;
}

export const webhookQueue = new Queue<WebhookJobData>('webhook-deliveries', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export function startWebhookWorker(): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    'webhook-deliveries',
    async (job: Job<WebhookJobData>) => {
      const { deliveryId, url, secret, payload, attempt } = job.data;
      await attemptDelivery(deliveryId, url, secret, payload, attempt);
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Webhook job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Webhook delivery worker started');
  return worker;
}
