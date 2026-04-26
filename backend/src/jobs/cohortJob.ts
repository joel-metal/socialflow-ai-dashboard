import { Job } from 'bullmq';
import { cohortService } from '../services/CohortService';
import { createLogger } from '../lib/logger';
import { CohortJobData } from '../queues/cohortQueue';
import { redisClient } from '../queues/queueManager';

const logger = createLogger('cohort-job');

export interface WaitOptions {
  pollMs?: number;
  timeoutMs?: number;
}

/** Key written by the daily job so the weekly job can wait for it on Monday. */
export function dailyCompleteKey(date: Date): string {
  return `cohort:daily-complete:${date.toISOString().slice(0, 10)}`;
}

/** Returns true when the given date falls on a Monday (UTC). */
export function isMonday(date: Date): boolean {
  return date.getUTCDay() === 1;
}

/**
 * Poll Redis until the daily-complete key exists or the timeout elapses.
 * Resolves true if the key appeared, false on timeout.
 */
export async function waitForDailyComplete(
  date: Date,
  { pollMs = 5_000, timeoutMs = 55 * 60 * 1_000 }: WaitOptions = {},
): Promise<boolean> {
  const key = dailyCompleteKey(date);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const exists = await redisClient.exists(key);
    if (exists) return true;
    await new Promise((res) => setTimeout(res, pollMs));
  }
  return false;
}

export async function processCohortJob(
  job: Job<CohortJobData>,
  now: Date = new Date(),
  waitOptions: WaitOptions = {},
): Promise<object> {
  const { organizationId, triggeredBy = 'manual' } = job.data;

  logger.info('Starting cohort computation job', {
    jobId: job.id,
    organizationId,
    triggeredBy,
  });

  // On Monday, the weekly job must wait until the daily job has finished.
  if (triggeredBy === 'weekly' && isMonday(now)) {
    logger.info('Weekly cohort job waiting for daily job to complete', { jobId: job.id });
    const dailyDone = await waitForDailyComplete(now, waitOptions);
    if (!dailyDone) {
      throw new Error('Weekly cohort job timed out waiting for daily job to complete on Monday');
    }
    logger.info('Daily cohort job confirmed complete; proceeding with weekly run', { jobId: job.id });
  }

  // Invalidate stale cache before recomputing
  cohortService.invalidateCache(organizationId);

  const result = await cohortService.computeCohorts(organizationId);

  // Signal that the daily job has finished so the weekly job can proceed.
  if (triggeredBy === 'daily') {
    const key = dailyCompleteKey(now);
    // TTL of 2 hours — well past the weekly job's 1 AM window.
    await redisClient.set(key, '1', 'EX', 7_200);
    logger.info('Daily cohort complete signal written', { key });
  }

  const summary = {
    jobId: job.id,
    triggeredBy,
    organizationId: organizationId ?? 'global',
    totalUsers: result.totalUsers,
    segments: result.segments.map((s) => ({
      cohort: s.cohort,
      count: s.count,
    })),
    computedAt: result.computedAt.toISOString(),
  };

  logger.info('Cohort computation job complete', summary);
  return summary;
}
