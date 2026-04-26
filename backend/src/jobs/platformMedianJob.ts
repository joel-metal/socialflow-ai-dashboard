import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../config/runtime';
import { createLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { predictiveService } from '../services/PredictiveService';
import { PlatformMedians } from '../types/predictive';

const logger = createLogger('platform-median-job');

const QUEUE_NAME = 'platform-median-refresh';
const JOB_NAME = 'compute-platform-medians';
const REPEAT_JOB_ID = 'platform-median-repeat';
/** Refresh every 6 hours */
const CRON = '0 */6 * * *';

let queue: Queue | null = null;
let worker: Worker | null = null;

/** Compute per-platform medians from AnalyticsEntry rows. */
export async function computePlatformMedians(): Promise<PlatformMedians> {
  const rows = await prisma.analyticsEntry.findMany({
    where: { metric: { in: ['reach', 'engagement'] } },
    select: { platform: true, metric: true, value: true },
  });

  // Group values by platform + metric
  const grouped: Record<string, Record<string, number[]>> = {};
  for (const { platform, metric, value } of rows) {
    grouped[platform] ??= {};
    grouped[platform][metric] ??= [];
    grouped[platform][metric].push(value);
  }

  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const result: PlatformMedians = {};
  for (const [platform, metrics] of Object.entries(grouped)) {
    result[platform] = {
      ...(metrics['reach'] ? { avgReach: median(metrics['reach']) } : {}),
      ...(metrics['engagement'] ? { avgEngagement: median(metrics['engagement']) } : {}),
    };
  }
  return result;
}

export const startPlatformMedianJob = async (): Promise<void> => {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }

  if (!worker) {
    worker = new Worker(
      QUEUE_NAME,
      async () => {
        const medians = await computePlatformMedians();
        predictiveService.seedFromMedians(medians);
        logger.info('Platform medians refreshed', { platforms: Object.keys(medians) });
        return medians;
      },
      { connection: getRedisConnection() },
    );

    worker.on('failed', (job, err) => {
      logger.error('Platform median job failed', { jobId: job?.id, error: err.message });
    });
  }

  await queue.add(JOB_NAME, {}, {
    repeat: { pattern: CRON },
    jobId: REPEAT_JOB_ID,
    removeOnComplete: 10,
    removeOnFail: 20,
  });

  logger.info('Platform median scheduler started', { cron: CRON });
};

export const stopPlatformMedianJob = async (): Promise<void> => {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
};
