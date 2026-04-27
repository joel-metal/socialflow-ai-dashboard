import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { getRedisConnection } from '../config/runtime';
import { createLogger } from '../lib/logger';
import { facebookService } from '../services/FacebookService';

const logger = createLogger('facebook-token-refresh-job');

const QUEUE_NAME = 'facebook-token-refresh';
const JOB_NAME = 'refresh-facebook-tokens';
const REPEAT_JOB_ID = 'facebook-token-refresh-repeat';

// Run daily at 03:00 UTC
const REFRESH_CRON = process.env.FACEBOOK_TOKEN_REFRESH_CRON || '0 3 * * *';

// Refresh tokens that expire within 10 days (Facebook long-lived tokens last 60 days)
const REFRESH_THRESHOLD_DAYS = 10;

/**
 * Redis key pattern for stored Facebook long-lived tokens.
 * Hash fields: accessToken, expiresAt (unix ms as string)
 *
 * Key: facebook:token:<userId>
 */
export const FACEBOOK_TOKEN_KEY = (userId: string) => `facebook:token:${userId}`;

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) _redis = new Redis(getRedisConnection());
  return _redis;
}

let queue: Queue | null = null;
let worker: Worker | null = null;

export const startFacebookTokenRefreshJob = async (): Promise<void> => {
  if (!facebookService.isConfigured()) {
    logger.info('Facebook API not configured, token refresh job skipped');
    return;
  }

  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const redis = getRedis();
        const thresholdMs = REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
        const expiryBefore = Date.now() + thresholdMs;

        // Scan for all facebook:token:* keys
        const keys: string[] = [];
        let cursor = '0';
        do {
          const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'facebook:token:*', 'COUNT', 100);
          cursor = nextCursor;
          keys.push(...batch);
        } while (cursor !== '0');

        logger.info('Facebook token refresh: scanning tokens', { jobId: job.id, total: keys.length });

        let refreshed = 0;
        let failed = 0;

        for (const key of keys) {
          const data = await redis.hgetall(key);
          if (!data.accessToken || !data.expiresAt) continue;

          const expiresAt = Number(data.expiresAt);
          if (expiresAt > expiryBefore) continue; // not expiring soon

          try {
            const result = await facebookService.getLongLivedUserToken(data.accessToken);
            await redis.hset(key, {
              accessToken: result.accessToken,
              expiresAt: String(result.expiresAt),
            });
            // Extend Redis TTL to match the new token lifetime (60 days + buffer)
            await redis.expireat(key, Math.ceil(result.expiresAt / 1000) + 86400);
            refreshed++;
            logger.info('Facebook token refreshed', { key });
          } catch (err: any) {
            logger.error('Failed to refresh Facebook token', { key, error: err.message });
            failed++;
          }
        }

        logger.info('Facebook token refresh complete', { jobId: job.id, refreshed, failed });
        return { refreshed, failed };
      },
      { connection: getRedisConnection() },
    );

    worker.on('completed', (job) => {
      logger.info('Facebook token refresh job completed', { jobId: job.id, result: job.returnvalue });
    });

    worker.on('failed', (job, error) => {
      logger.error('Facebook token refresh job failed', { jobId: job?.id, error: error.message });
    });
  }

  await queue.add(
    JOB_NAME,
    {},
    {
      repeat: { pattern: REFRESH_CRON },
      jobId: REPEAT_JOB_ID,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  logger.info('Facebook token refresh job started', { cron: REFRESH_CRON });
};

export const stopFacebookTokenRefreshJob = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  logger.info('Facebook token refresh job stopped');
};
