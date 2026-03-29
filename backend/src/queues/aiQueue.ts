import { queueManager } from './queueManager';
import { enqueue, enqueueAt } from '../utils/queue';

export const AI_QUEUE_NAME = 'ai-generation';

export type AIJobType =
  | 'generate-caption'
  | 'generate-hashtags'
  | 'generate-content'
  | 'analyze-sentiment'
  | 'translate-content';

export interface AIJobData {
  type: AIJobType;
  prompt: string;
  userId: string;
  organizationId?: string;
  options?: Record<string, unknown>;
}

// High-priority queue: 5 attempts with exponential backoff, keep last 200 failures for review
export const aiQueue = queueManager.createQueue(AI_QUEUE_NAME, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 50,
  removeOnFail: 200,
});

export const enqueueAIJob = (data: AIJobData, priority = 1) =>
  enqueue<AIJobData>(AI_QUEUE_NAME, data.type, data, { priority });

export const scheduleAIJob = (data: AIJobData, at: Date) =>
  enqueueAt<AIJobData>(AI_QUEUE_NAME, data.type, data, at);

export const getAIQueueStats = () => queueManager.getQueueStats(AI_QUEUE_NAME);
export const getFailedAIJobs = (start = 0, end = 20) =>
  queueManager.getFailedJobs(AI_QUEUE_NAME, start, end);
export const retryFailedAIJob = (jobId: string) => queueManager.retryJob(AI_QUEUE_NAME, jobId);
