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

const socialProcessors: Record<SocialJobType, (job: Job<SocialJobData>) => Promise<unknown>> = {
  'publish-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Publishing post', { jobId: job.id, platform, userId });
    // TODO: wire to platform service (TwitterService, FacebookService, etc.)
    return { postId: null, platform, publishedAt: new Date().toISOString() };
  },
  'schedule-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Scheduling post', { jobId: job.id, platform, userId, scheduledAt: payload.scheduledAt });
    // TODO: wire to platform service with scheduledAt
    return { postId: null, platform, scheduledAt: payload.scheduledAt };
  },
  'delete-post': async (job) => {
    const { platform, userId, payload } = job.data;
    logger.info('Deleting post', { jobId: job.id, platform, userId, postId: payload.postId });
    // TODO: wire to platform service delete
    return { deleted: true, platform, postId: payload.postId };
  },
  'sync-analytics': async (job) => {
    const { platform, userId } = job.data;
    logger.info('Syncing analytics', { jobId: job.id, platform, userId });
    // TODO: wire to AnalyticsService.sync(platform, userId)
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
