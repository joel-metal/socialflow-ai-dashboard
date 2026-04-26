import { queueManager } from './queueManager';

// Queue names
export const PAYOUT_QUEUE_NAME = 'payout';

// Payout job data interfaces
export interface PayoutJobData {
  groupId: string;
  amount: number;
  recipient: string;
  recipientType: 'wallet' | 'bank' | 'paypal' | 'crypto';
  currency: string;
  description?: string;
  metadata?: {
    campaignId?: string;
    userId?: string;
    paymentMethod?: string;
  };
}

export interface ScheduledPayoutData extends PayoutJobData {
  scheduledFor: Date;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    endDate?: Date;
  };
}

// Create the payout queue with high reliability settings
export const payoutQueue = queueManager.createQueue(PAYOUT_QUEUE_NAME, {
  attempts: 5, // More attempts for financial transactions
  backoff: {
    type: 'exponential',
    delay: 5000, // Longer delay for financial operations
  },
  removeOnComplete: false, // Keep completed payout records
  removeOnFail: false, // Keep failed payout records for audit
});

/**
 * Process a payout immediately
 */
export async function processPayout(data: PayoutJobData): Promise<string | undefined> {
  const jobId = await queueManager.addJob(PAYOUT_QUEUE_NAME, 'process-payout', data, {
    priority: 1, // High priority for immediate payouts
  });
  return jobId;
}

/**
 * Schedule a payout for a future date
 */
export async function schedulePayout(
  data: PayoutJobData,
  scheduledFor: Date,
): Promise<string | undefined> {
  const delay = scheduledFor.getTime() - Date.now();

  if (delay < 0) {
    throw new Error('Scheduled time must be in the future');
  }

  const jobId = await queueManager.addJob(PAYOUT_QUEUE_NAME, 'process-payout', data, {
    priority: 2, // Lower priority for scheduled payouts
    delay,
  });
  return jobId;
}

/**
 * Schedule recurring payout
 */
export async function scheduleRecurringPayout(data: ScheduledPayoutData): Promise<string[]> {
  const jobIds: string[] = [];
  const { scheduledFor, recurring } = data;

  if (!recurring) {
    throw new Error('Recurring configuration is required');
  }

  // Calculate intervals based on frequency
  const intervals: Record<string, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000, // Approximate
  };

  const interval = intervals[recurring.frequency];
  const endDate = recurring.endDate || new Date(scheduledFor.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

  let currentDate = new Date(scheduledFor);

  // Generate jobs for the next year or until end date
  while (currentDate.getTime() < endDate.getTime()) {
    const delay = currentDate.getTime() - Date.now();

    if (delay > 0) {
      const jobId = await queueManager.addJob(PAYOUT_QUEUE_NAME, 'process-payout', data, {
        priority: 2,
        delay,
        repeat:
          recurring.frequency === 'daily'
            ? {
                cron: `${currentDate.getMinutes()} ${currentDate.getHours()} * * *`,
              }
            : undefined,
      });

      if (jobId) {
        jobIds.push(jobId);
      }
    }

    currentDate = new Date(currentDate.getTime() + interval);
  }

  return jobIds;
}

/**
 * Process batch payouts
 */
export async function processBatchPayouts(payouts: PayoutJobData[]): Promise<string[]> {
  const jobs = payouts.map((payout) => ({
    name: 'process-payout',
    data: payout,
    options: { priority: 1 },
  }));

  return await queueManager.addBulkJobs(PAYOUT_QUEUE_NAME, jobs);
}

/**
 * Get payout queue statistics
 */
export async function getPayoutQueueStats() {
  return await queueManager.getQueueStats(PAYOUT_QUEUE_NAME);
}

/**
 * Get failed payout jobs
 */
export async function getFailedPayouts(start: number = 0, end: number = 20) {
  return await queueManager.getFailedJobs(PAYOUT_QUEUE_NAME, start, end);
}

/**
 * Get waiting payout jobs
 */
export async function getWaitingPayouts(start: number = 0, end: number = 20) {
  return await queueManager.getWaitingJobs(PAYOUT_QUEUE_NAME, start, end);
}

/**
 * Retry a failed payout job
 */
export async function retryFailedPayout(jobId: string) {
  return await queueManager.retryJob(PAYOUT_QUEUE_NAME, jobId);
}

/**
 * Cancel a pending payout
 */
export async function cancelPayout(jobId: string): Promise<void> {
  return await queueManager.removeJob(PAYOUT_QUEUE_NAME, jobId);
}
