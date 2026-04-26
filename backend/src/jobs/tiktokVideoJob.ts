import fs from 'fs';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from '../config/runtime';
import { createLogger } from '../lib/logger';
import { tiktokService, TikTokVideoUploadRequest } from '../services/TikTokService';
import { dispatchEvent } from '../services/WebhookDispatcher';

const logger = createLogger('tiktok-video-job');

const QUEUE_NAME = 'tiktok-video-upload';
const JOB_NAME = 'upload-tiktok-video';

let queue: Queue | null = null;
let worker: Worker | null = null;

export interface TikTokVideoJobPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Absolute path to the video file on disk */
  filePath: string;
  fileSizeBytes: number;
  request: TikTokVideoUploadRequest;
}

export interface TikTokStatusJobPayload {
  accessToken: string;
  publishId: string;
  /** How many times we've polled so far */
  pollCount: number;
}

const getQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
};

/**
 * Enqueue a chunked video upload job.
 */
export const enqueueTikTokVideoUpload = async (payload: TikTokVideoJobPayload): Promise<string> => {
  const q = getQueue();
  const job = await q.add(JOB_NAME, payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
  logger.info('TikTok video upload job enqueued', { jobId: job.id });
  return job.id!;
};

/**
 * Enqueue a status-polling job (called after upload completes).
 */
export const enqueueTikTokStatusPoll = async (payload: TikTokStatusJobPayload): Promise<void> => {
  const q = getQueue();
  await q.add('poll-tiktok-status', payload, {
    delay: 10_000, // first poll after 10 s
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: { age: 86400 },
  });
};

/**
 * Start the BullMQ worker that processes TikTok video upload jobs.
 */
export const startTikTokVideoWorker = (): void => {
  if (worker) return;

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === JOB_NAME) {
        await handleVideoUpload(job);
      } else if (job.name === 'poll-tiktok-status') {
        await handleStatusPoll(job);
      }
    },
    { connection: getRedisConnection() },
  );

  worker.on('completed', (job) => {
    logger.info('TikTok job completed', { jobId: job.id, name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error('TikTok job failed', { jobId: job?.id, name: job?.name, error: err.message });
  });

  logger.info('TikTok video worker started');
};

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleVideoUpload(job: Job): Promise<void> {
  const { accessToken, filePath, fileSizeBytes, request } = job.data as TikTokVideoJobPayload;

  logger.info('Starting TikTok chunked video upload', { filePath, fileSizeBytes });

  // Dispatch processing event
  await dispatchEvent('tiktok.video_processing', {
    filePath,
    title: request.title,
    status: 'uploading',
  });

  // Initiate upload and get upload URL + publishId
  const { publishId, uploadUrl, chunkSize, totalChunks } = await tiktokService.initiateVideoUpload(
    accessToken,
    fileSizeBytes,
    request,
  );

  // Read and upload file in chunks
  const fileHandle = await fs.promises.open(filePath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const buffer = Buffer.alloc(Math.min(chunkSize, fileSizeBytes - i * chunkSize));
      await fileHandle.read(buffer, 0, buffer.length, i * chunkSize);
      await tiktokService.uploadChunk(uploadUrl, buffer, i, totalChunks, fileSizeBytes);

      // Report progress
      await job.updateProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
  } finally {
    await fileHandle.close();
  }

  logger.info('All chunks uploaded, queuing status poll', { publishId });

  // Queue status polling
  await enqueueTikTokStatusPoll({ accessToken, publishId, pollCount: 0 });
}

async function handleStatusPoll(job: Job): Promise<void> {
  const { accessToken, publishId, pollCount } = job.data as TikTokStatusJobPayload;

  const status = await tiktokService.getVideoStatus(accessToken, publishId);
  logger.info('TikTok video status', { publishId, status: status.status, pollCount });

  if (status.status === 'PUBLISH_COMPLETE') {
    await dispatchEvent('tiktok.video_published', {
      publishId,
      shareUrl: status.shareUrl,
      publiclyAvailable: status.publiclyAvailable,
    });
    return;
  }

  if (status.status === 'FAILED') {
    await dispatchEvent('tiktok.video_failed', {
      publishId,
      failReason: status.failReason,
    });
    return;
  }

  // Still processing — re-queue with back-off (max 30 polls ≈ ~10 minutes)
  const MAX_POLLS = 30;
  if (pollCount < MAX_POLLS) {
    const delay = Math.min(10_000 * Math.pow(1.5, pollCount), 60_000); // up to 60 s
    await enqueueTikTokStatusPoll({ accessToken, publishId, pollCount: pollCount + 1 });
    logger.info('TikTok video still processing, re-polling', { publishId, delay, pollCount });
  } else {
    logger.warn('TikTok video status polling timed out', { publishId });
    await dispatchEvent('tiktok.video_failed', {
      publishId,
      failReason: 'Status polling timed out after maximum attempts',
    });
  }
}
