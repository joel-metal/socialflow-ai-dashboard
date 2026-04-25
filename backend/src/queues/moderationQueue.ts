import { queueManager } from './queueManager';

export const MODERATION_QUEUE_NAME = 'moderation';
export const MODERATION_DLQ_NAME = 'moderation-dlq';

export interface ModerationJobData {
  postId: string;
}

export const moderationQueue = queueManager.createQueue(MODERATION_QUEUE_NAME, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: { count: 100 },
});

// Dead-letter queue for exhausted moderation jobs
export const moderationDLQ = queueManager.createQueue(MODERATION_DLQ_NAME, {
  attempts: 1,
  removeOnComplete: 1000,
  removeOnFail: false, // Keep failed DLQ jobs indefinitely for investigation
});

export async function enqueueModeration(postId: string): Promise<string | undefined> {
  return queueManager.addJob(MODERATION_QUEUE_NAME, 'moderate-post', { postId });
}

export async function enqueueToDLQ(
  postId: string,
  originalJobId: string,
  failureReason: string,
): Promise<string | undefined> {
  return queueManager.addJob(MODERATION_DLQ_NAME, 'dlq-alert', {
    postId,
    originalJobId,
    failureReason,
    enqueuedAt: new Date().toISOString(),
  });
}
