/**
 * Shared queue utility — thin typed wrapper over QueueManager.
 * Import this instead of queueManager directly for enqueuing jobs.
 */
import { Job, JobsOptions } from 'bullmq';
import { queueManager } from '../queues/queueManager';

export { queueManager };

export interface EnqueueOptions {
  /** Lower number = higher priority (BullMQ convention) */
  priority?: number;
  /** Delay in milliseconds before the job becomes active */
  delay?: number;
  /** Override default retry attempts */
  attempts?: number;
}

/**
 * Enqueue a single typed job.
 * Returns the BullMQ job ID.
 */
export async function enqueue<T>(
  queue: string,
  name: string,
  data: T,
  opts: EnqueueOptions = {},
): Promise<string> {
  const jobOpts: JobsOptions = {
    priority: opts.priority,
    delay: opts.delay,
    ...(opts.attempts !== undefined && {
      attempts: opts.attempts,
      backoff: { type: 'exponential', delay: 2000 },
    }),
  };

  const id = await queueManager.addJob(queue, name, data, jobOpts);
  return id!;
}

/**
 * Enqueue a job to run at a specific future time.
 */
export async function enqueueAt<T>(queue: string, name: string, data: T, at: Date): Promise<string> {
  const delay = at.getTime() - Date.now();
  if (delay < 0) throw new Error('Scheduled time must be in the future');
  return enqueue(queue, name, data, { delay });
}

/**
 * Retrieve queue health stats for monitoring endpoints.
 */
export async function getQueueHealth(queue: string) {
  return queueManager.getQueueStats(queue);
}

export type { Job };
