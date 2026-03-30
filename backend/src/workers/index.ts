/**
 * src/workers/index.ts
 *
 * Worker entry point for AI generation and social posting queues.
 * Each worker runs in the same process as the server; for horizontal
 * scaling, this file can be run as a standalone process via:
 *   node -r ts-node/register src/workers/index.ts
 */
import { Job, Worker } from 'bullmq';
import { queueManager } from '../queues/queueManager';
import { AI_QUEUE_NAME, AIJobData, AIJobType } from '../queues/aiQueue';
import { SOCIAL_QUEUE_NAME, SocialJobData, SocialJobType } from '../queues/socialQueue';
import { createLogger } from '../lib/logger';
import { twitterService } from '../services/TwitterService';
import { linkedInService } from '../services/LinkedInService';
import { instagramService } from '../services/InstagramService';
import { tiktokService } from '../services/TikTokService';
import { facebookService } from '../services/FacebookService';
import { ValidationError } from '../lib/errors';

const logger = createLogger('workers');

// ── AI generation processors ─────────────────────────────────────────────────

const aiProcessors: Record<AIJobType, (job: Job<AIJobData>) => Promise<unknown>> = {
  'generate-caption': async (job) => {
    logger.info('Generating caption', { jobId: job.id, userId: job.data.userId });
    // TODO: wire to AIService.generateCaption(job.data.prompt, job.data.options)
    return { caption: null, generatedAt: new Date().toISOString() };
  },
  'generate-hashtags': async (job) => {
    logger.info('Generating hashtags', { jobId: job.id, userId: job.data.userId });
    // TODO: wire to AIService.generateHashtags(job.data.prompt)
    return { hashtags: [], generatedAt: new Date().toISOString() };
  },
  'generate-content': async (job) => {
    logger.info('Generating content', { jobId: job.id, userId: job.data.userId });
    // TODO: wire to AIService.generateContent(job.data.prompt, job.data.options)
    return { content: null, generatedAt: new Date().toISOString() };
  },
  'analyze-sentiment': async (job) => {
    logger.info('Analysing sentiment', { jobId: job.id, userId: job.data.userId });
    // TODO: wire to AIService.analyzeSentiment(job.data.prompt)
    return { sentiment: null, analysedAt: new Date().toISOString() };
  },
  'translate-content': async (job) => {
    logger.info('Translating content', { jobId: job.id, userId: job.data.userId });
    // TODO: wire to TranslationService.translate(job.data.prompt, job.data.options)
    return { translation: null, translatedAt: new Date().toISOString() };
  },
};

// ── Social posting processors ─────────────────────────────────────────────────

/** Extract and validate the access token from job options. */
function requireToken(job: Job<SocialJobData>): string {
  const token = job.data.payload.options?.accessToken as string | undefined;
  if (!token) {
    throw new ValidationError('accessToken is required in payload.options', 'MISSING_ACCESS_TOKEN');
  }
  return token;
}

const socialProcessors: Record<SocialJobType, (job: Job<SocialJobData>) => Promise<unknown>> = {
  'publish-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Publishing post', { jobId: job.id, platform, userId });

    if (!payload.content && !payload.mediaUrls?.length) {
      throw new ValidationError('content or mediaUrls required for publish-post', 'INVALID_PAYLOAD');
    }

    const token = requireToken(job);

    switch (platform) {
      case 'twitter': {
        const post = await twitterService.postTweet({ text: payload.content ?? '' });
        return { postId: post.id, platform, publishedAt: post.created_at };
      }
      case 'linkedin': {
        const authorUrn = payload.options?.authorUrn as string;
        if (!authorUrn) throw new ValidationError('authorUrn required for LinkedIn', 'INVALID_PAYLOAD');
        const result = await linkedInService.shareContent(token, {
          authorUrn,
          text: payload.content ?? '',
          url: payload.options?.url as string | undefined,
          title: payload.options?.title as string | undefined,
          description: payload.options?.description as string | undefined,
        });
        return { postId: result.id, platform, publishedAt: new Date().toISOString() };
      }
      case 'instagram': {
        const igAccountId = payload.options?.igAccountId as string;
        if (!igAccountId) throw new ValidationError('igAccountId required for Instagram', 'INVALID_PAYLOAD');
        const result = await instagramService.publish({
          igAccountId,
          accessToken: token,
          mediaType: (payload.options?.mediaType as any) ?? 'IMAGE',
          mediaUrl: payload.mediaUrls?.[0] ?? '',
          caption: payload.content,
        });
        return { postId: result.mediaId, platform, publishedAt: result.publishedAt };
      }
      case 'tiktok': {
        const videoUrl = payload.mediaUrls?.[0];
        if (!videoUrl) throw new ValidationError('mediaUrls[0] required for TikTok video', 'INVALID_PAYLOAD');
        const result = await tiktokService.uploadVideoFromUrl(token, {
          videoSource: videoUrl,
          sourceType: 'PULL_FROM_URL',
          title: payload.content ?? 'New video',
        });
        return { postId: result.publishId, platform, publishedAt: new Date().toISOString() };
      }
      case 'facebook': {
        const pageId = payload.options?.pageId as string;
        if (!pageId) throw new ValidationError('pageId required for Facebook', 'INVALID_PAYLOAD');
        if (!payload.content) throw new ValidationError('content required for Facebook', 'INVALID_PAYLOAD');
        const result = await facebookService.postToPage({
          pageId,
          message: payload.content,
        });
        return { postId: result.id, platform, publishedAt: new Date().toISOString() };
      }
      default:
        throw new ValidationError(`Unsupported platform: ${platform}`, 'UNSUPPORTED_PLATFORM');
    }
  },

  'schedule-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Scheduling post', { jobId: job.id, platform, userId, scheduledAt: payload.scheduledAt });

    if (!payload.scheduledAt) {
      throw new ValidationError('scheduledAt is required for schedule-post', 'INVALID_PAYLOAD');
    }
    if (!payload.content && !payload.mediaUrls?.length) {
      throw new ValidationError('content or mediaUrls required for schedule-post', 'INVALID_PAYLOAD');
    }

    const token = requireToken(job);
    const scheduledAt = new Date(payload.scheduledAt);

    switch (platform) {
      case 'instagram': {
        const igAccountId = payload.options?.igAccountId as string;
        if (!igAccountId) throw new ValidationError('igAccountId required for Instagram', 'INVALID_PAYLOAD');
        const result = await instagramService.publish({
          igAccountId,
          accessToken: token,
          mediaType: (payload.options?.mediaType as any) ?? 'IMAGE',
          mediaUrl: payload.mediaUrls?.[0] ?? '',
          caption: payload.content,
          scheduledPublishTime: scheduledAt,
        });
        return { postId: result.mediaId, platform, scheduledAt: payload.scheduledAt };
      }
      // Twitter, LinkedIn, TikTok, Facebook do not have native scheduling via API;
      // BullMQ delayed jobs handle the timing — publish at the scheduled time.
      default: {
        // Re-enqueue as a publish-post job delayed to scheduledAt
        const { enqueueSocialJob } = await import('../queues/socialQueue');
        const jobId = await enqueueSocialJob(
          { ...job.data, type: 'publish-post' },
          job.opts?.priority,
        );
        return { postId: null, platform, scheduledAt: payload.scheduledAt, queuedJobId: jobId };
      }
    }
  },

  'delete-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Deleting post', { jobId: job.id, platform, userId, postId: payload.postId });

    if (!payload.postId) {
      throw new ValidationError('postId is required for delete-post', 'INVALID_PAYLOAD');
    }

    const token = requireToken(job);

    switch (platform) {
      case 'facebook':
      case 'instagram': {
        // Both use the Facebook Graph API for deletion
        const deleted = await facebookService.deleteComment(payload.postId, token);
        return { deleted, platform, postId: payload.postId };
      }
      default:
        // Twitter, LinkedIn, TikTok deletion endpoints require additional
        // OAuth scopes not yet provisioned; log and surface for manual action.
        logger.warn('Delete not yet implemented for platform', { platform, postId: payload.postId });
        return { deleted: false, platform, postId: payload.postId, reason: 'not_implemented' };
    }
  },

  'sync-analytics': async (job) => {
    const { platform, userId } = job.data;
    logger.info('Syncing analytics', { jobId: job.id, platform, userId });
    // Analytics sync is handled by AnalyticsService.sync() on the frontend.
    // This job is a no-op placeholder for server-side triggered syncs.
    return { synced: true, platform, syncedAt: new Date().toISOString() };
  },
};

// ── Worker factory ────────────────────────────────────────────────────────────

function createAIWorker(): Worker<AIJobData> {
  return queueManager.createWorker(
    AI_QUEUE_NAME,
    async (job: Job<AIJobData>) => {
      const processor = aiProcessors[job.data.type];
      if (!processor) {
        throw new Error(`Unknown AI job type: ${job.data.type}`);
      }
      return processor(job);
    },
    { concurrency: 5 }, // AI calls are I/O-bound; 5 concurrent is safe
  ) as Worker<AIJobData>;
}

function createSocialWorker(): Worker<SocialJobData> {
  return queueManager.createWorker(
    SOCIAL_QUEUE_NAME,
    async (job: Job<SocialJobData>) => {
      const processor = socialProcessors[job.data.type];
      if (!processor) {
        throw new Error(`Unknown social job type: ${job.data.type}`);
      }
      return processor(job);
    },
    { concurrency: 3 }, // Lower concurrency to respect platform rate limits
  ) as Worker<SocialJobData>;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function startWorkers(): { ai: Worker<AIJobData>; social: Worker<SocialJobData> } {
  const ai = createAIWorker();
  const social = createSocialWorker();
  logger.info('AI and social workers started', {
    queues: [AI_QUEUE_NAME, SOCIAL_QUEUE_NAME],
  });
  return { ai, social };
}
