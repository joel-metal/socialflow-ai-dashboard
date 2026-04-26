import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '../lib/logger';
import { attemptDelivery } from '../services/WebhookDispatcher';
import { getRedisConnection } from '../config/runtime';
import { prisma } from '../lib/prisma';

const logger = createLogger('WebhookQueue');

const connection = getRedisConnection();

export interface WebhookJobData {
  deliveryId: string;
  url: string;
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
      const { deliveryId, url, payload, attempt } = job.data;

      // Fetch the current secret at delivery time so rotated secrets are always used.
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        select: { subscription: { select: { secret: true } } },
      });
      if (!delivery) {
        logger.warn(`Delivery ${deliveryId} not found; skipping`);
        return;
      }

      await attemptDelivery(deliveryId, url, delivery.subscription.secret, payload, attempt);
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Webhook job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Webhook delivery worker started');
  return worker;
}
