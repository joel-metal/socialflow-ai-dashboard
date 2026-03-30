import { Queue, Worker, QueueEvents, JobsOptions, ConnectionOptions } from 'bullmq';
import { config } from '../config/config';
import { createLogger } from '../lib/logger';
import { redis as redisClient } from '../lib/redis';
import { bullmqQueueWaiting } from '../lib/metrics';

export { redisClient };

const logger = createLogger('queue-manager');

/**
 * Parse Redis URL into connection options
 * Supports formats: redis://host:port, redis://user:pass@host:port, rediss://host:port (TLS)
 */
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };
  } catch (error) {
    logger.error('Failed to parse REDIS_URL, falling back to default', { error });
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

/**
 * Create a shared Redis connection using ioredis
 * This connection is used for BullMQ queues
 */
function createRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    logger.info('Using Redis connection from REDIS_URL');
    return parseRedisUrl(redisUrl);
  }

  // Fallback to individual config values
  logger.info('Using Redis connection from config (REDIS_HOST, REDIS_PORT)');
  return {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
  };
}

// Redis connection configuration using REDIS_URL or fallback
const connection: ConnectionOptions = createRedisConnection();

// Queue options interface
export interface QueueConfig {
  name: string;
  defaultJobOptions?: JobsOptions;
}

/**
 * QueueManager - Centralized queue management for BullMQ
 * Handles creation, lifecycle, and monitoring of all job queues
 */
export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  /**
   * Create a new queue or return existing one
   */
  createQueue(name: string, options?: Partial<JobsOptions>): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
        ...options,
      },
    });

    // Set up queue events for monitoring
    const queueEvents = new QueueEvents(name, { connection });
    this.queueEvents.set(name, queueEvents);

    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info(`Job ${jobId} completed`, { returnvalue });
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed`, { failedReason });
    });

    queueEvents.on('stalled', ({ jobId }) => {
      logger.warn(`Job ${jobId} stalled`);
    });

    this.queues.set(name, queue);
    logger.info(`Queue "${name}" created`);

    return queue;
  }

  /**
   * Create a worker for processing jobs
   */
  createWorker(
    name: string,
    processor: (job: any) => Promise<any>,
    options: { concurrency?: number; limiter?: any } = {},
  ): Worker {
    if (this.workers.has(name)) {
      return this.workers.get(name)!;
    }

    const worker = new Worker(name, processor, {
      connection,
      concurrency: options.concurrency || 5,
      limiter: options.limiter,
    });

    // Error handling
    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed`, { error: err.message });
    });

    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed`);
    });

    worker.on('active', (job) => {
      logger.info(`Job ${job.id} started processing`);
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Job ${jobId} stalled and will be retried`);
    });

    worker.on('error', (err) => {
      logger.error(`Worker error for queue "${name}"`, { error: err.message });
    });

    this.workers.set(name, worker);
    logger.info(`Worker for queue "${name}" created`);

    return worker;
  }

  /**
   * Get a queue by name
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Get a worker by name
   */
  getWorker(name: string): Worker | undefined {
    return this.workers.get(name);
  }

  /**
   * Get queue events for monitoring
   */
  getQueueEvents(name: string): QueueEvents | undefined {
    return this.queueEvents.get(name);
  }

  /**
   * Get all queue statistics
   */
  async getQueueStats(name: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  } | null> {
    const queue = this.queues.get(name);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Add a job to a queue
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: {
      priority?: number;
      delay?: number;
      repeat?: any;
      cron?: string;
    },
  ): Promise<string | undefined> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    const job = await queue.add(jobName, data, {
      priority: options?.priority,
      delay: options?.delay,
      repeat: options?.repeat,
      jobId: `${queueName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });

    logger.info(`Job "${jobName}" added to queue "${queueName}"`, { jobId: job.id });
    return job.id;
  }

  /**
   * Add bulk jobs to a queue
   */
  async addBulkJobs(
    queueName: string,
    jobs: Array<{
      name: string;
      data: any;
      options?: { priority?: number; delay?: number };
    }>,
  ): Promise<string[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    const bulkJobs = jobs.map((job) => ({
      name: job.name,
      data: job.data,
      opts: {
        priority: job.options?.priority,
        delay: job.options?.delay,
      },
    }));

    const addedJobs = await queue.addBulk(bulkJobs);
    logger.info(`Added ${addedJobs.length} jobs to queue "${queueName}"`);
    return addedJobs.map((job) => job.id as string);
  }

  /**
   * Get failed jobs from a queue
   */
  async getFailedJobs(name: string, start: number = 0, end: number = 20): Promise<any[]> {
    const queue = this.queues.get(name);
    if (!queue) return [];

    return await queue.getFailed(start, end);
  }

  /**
   * Get waiting jobs from a queue
   */
  async getWaitingJobs(name: string, start: number = 0, end: number = 20): Promise<any[]> {
    const queue = this.queues.get(name);
    if (!queue) return [];

    return await queue.getWaiting(start, end);
  }

  /**
   * Get active jobs from a queue
   */
  async getActiveJobs(name: string, start: number = 0, end: number = 20): Promise<any[]> {
    const queue = this.queues.get(name);
    if (!queue) return [];

    return await queue.getActive(start, end);
  }

  /**
   * Pause a queue
   */
  async pauseQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.pause();
      logger.info(`Queue "${name}" paused`);
    }
  }

  async resumeQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.resume();
      logger.info(`Queue "${name}" resumed`);
    }
  }

  async clearQueue(name: string): Promise<void> {
    const queue = this.queues.get(name);
    if (queue) {
      await queue.drain();
      logger.info(`Queue "${name}" cleared`);
    }
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Job ${jobId} removed from queue "${queueName}"`);
      }
    }
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.retry();
        logger.info(`Job ${jobId} retry initiated`);
      }
    }
  }

  /**
   * Get list of all queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Refresh Prometheus queue-depth gauges for all registered queues.
   * Called by the /metrics route before Prometheus scrapes.
   */
  async refreshQueueMetrics(): Promise<void> {
    await Promise.all(
      Array.from(this.queues.entries()).map(async ([name, queue]) => {
        try {
          const waiting = await queue.getWaitingCount();
          bullmqQueueWaiting.set({ queue: name }, waiting);
        } catch {
          // non-fatal — Redis may be temporarily unavailable
        }
      }),
    );
  }

  /**
   * Close all queues and workers gracefully
   */
  async closeAll(): Promise<void> {
    logger.info('Closing all queues and workers...');

    // Close all workers first
    const workerClosePromises = Array.from(this.workers.values()).map((worker) => worker.close());

    // Close all queue events
    const eventsClosePromises = Array.from(this.queueEvents.values()).map((events) =>
      events.close(),
    );

    // Close all queues
    const queueClosePromises = Array.from(this.queues.values()).map((queue) => queue.close());

    await Promise.all([...workerClosePromises, ...eventsClosePromises, ...queueClosePromises]);

    logger.info('All queues, workers, and connections closed');
  }
}

// Singleton instance
export const queueManager = new QueueManager();

// Export connection config for direct access if needed
export { connection as redisConnection };

/**
 * Closes the standalone redisClient connection.
 * Call this during graceful shutdown after queueManager.closeAll().
 */
export async function closeRedisClient(): Promise<void> {
  await redisClient.quit();
}
