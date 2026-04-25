import { queueManager } from './queueManager';
import { enqueue, enqueueAt } from '../utils/queue';
import { captureTraceContext, SerializedTraceContext } from '../lib/traceContext';

export const SOCIAL_QUEUE_NAME = 'social-posting';

export type SocialPlatform = 'twitter' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin';
export type SocialJobType = 'publish-post' | 'schedule-post' | 'delete-post' | 'sync-analytics';

export interface SocialJobData {
  type: SocialJobType;
  platform: SocialPlatform;
  userId: string;
  organizationId?: string;
  payload: {
    content?: string;
    mediaUrls?: string[];
    postId?: string;
    scheduledAt?: string;
    options?: Record<string, unknown>;
  };
  /** W3C trace context captured at enqueue time; used to link job spans to the originating HTTP span. */
  traceContext?: SerializedTraceContext;
}

// Background queue: 3 attempts, longer backoff — rate-limit friendly
export const socialQueue = queueManager.createQueue(SOCIAL_QUEUE_NAME, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
});

export const enqueueSocialJob = (data: SocialJobData, priority = 2) =>
  enqueue<SocialJobData>(SOCIAL_QUEUE_NAME, data.type, { ...data, traceContext: captureTraceContext() }, { priority });

export const scheduleSocialPost = (data: SocialJobData, at: Date) =>
  enqueueAt<SocialJobData>(SOCIAL_QUEUE_NAME, data.type, data, at);

export const getSocialQueueStats = () => queueManager.getQueueStats(SOCIAL_QUEUE_NAME);
export const getFailedSocialJobs = (start = 0, end = 20) =>
  queueManager.getFailedJobs(SOCIAL_QUEUE_NAME, start, end);
export const retryFailedSocialJob = (jobId: string) =>
  queueManager.retryJob(SOCIAL_QUEUE_NAME, jobId);
