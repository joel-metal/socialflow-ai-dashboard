import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '../lib/logger';
import { WebhookEventType } from '../schemas/webhooks';

const logger = createLogger('twitter-webhook-queue');

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

export interface TwitterWebhookJobData {
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export const twitterWebhookQueue = new Queue<TwitterWebhookJobData>('twitter-webhook-events', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

/**
 * Map raw Twitter Account Activity API event keys to internal event types.
 * Returns null for unrecognised event types (they are silently dropped).
 */
export function mapTwitterEvent(body: Record<string, unknown>): TwitterWebhookJobData[] {
  const jobs: TwitterWebhookJobData[] = [];
  const receivedAt = new Date().toISOString();

  if (body.follow_events) {
    for (const e of body.follow_events as any[]) {
      jobs.push({
        eventType: e.type === 'unfollow' ? 'twitter.unfollow' : 'twitter.follow',
        payload: e,
        receivedAt,
      });
    }
  }
  if (body.tweet_create_events) {
    for (const e of body.tweet_create_events as any[]) {
      // A mention contains the account's user_id in the text entities
      const isMention = !!(e.entities?.user_mentions?.length);
      jobs.push({ eventType: isMention ? 'twitter.mention' : 'twitter.mention', payload: e, receivedAt });
    }
  }
  if (body.favorite_events) {
    for (const e of body.favorite_events as any[]) {
      jobs.push({ eventType: 'twitter.like', payload: e, receivedAt });
    }
  }
  if (body.direct_message_events) {
    for (const e of body.direct_message_events as any[]) {
      jobs.push({ eventType: 'twitter.dm', payload: e, receivedAt });
    }
  }
  if (body.tweet_delete_events) {
    for (const e of body.tweet_delete_events as any[]) {
      jobs.push({ eventType: 'twitter.tweet_delete', payload: e, receivedAt });
    }
  }

  return jobs;
}

export function startTwitterWebhookWorker(): Worker<TwitterWebhookJobData> {
  const worker = new Worker<TwitterWebhookJobData>(
    'twitter-webhook-events',
    async (job: Job<TwitterWebhookJobData>) => {
      const { eventType, payload } = job.data;
      logger.info('Processing Twitter webhook event', { eventType, jobId: job.id });

      // Dispatch to internal webhook subscribers
      const { dispatchEvent } = await import('../services/WebhookDispatcher');
      await dispatchEvent(eventType, payload, 'twitter');
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Twitter webhook job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Twitter webhook worker started');
  return worker;
}
