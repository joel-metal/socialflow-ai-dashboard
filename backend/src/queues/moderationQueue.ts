import { queueManager } from './queueManager';

export const MODERATION_QUEUE_NAME = 'moderation';

export interface ModerationJobData {
  postId: string;
}

export const moderationQueue = queueManager.createQueue(MODERATION_QUEUE_NAME, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
});

export async function enqueueModeration(postId: string): Promise<string | undefined> {
  return queueManager.addJob(MODERATION_QUEUE_NAME, 'moderate-post', { postId });
}
