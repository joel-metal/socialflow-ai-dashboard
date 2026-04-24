import Redlock from 'redlock';
import Redis from 'ioredis';
import { createLogger } from '../lib/logger';
import { getRedisConnection } from '../config/runtime';

const logger = createLogger('lock-service');

const redisClient = new Redis(getRedisConnection());

const redlock = new Redlock([redisClient], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
  automaticExtensionThreshold: 500,
});

export interface LockOptions {
  duration?: number;
  retries?: number;
}

export const LockService = {
  /**
   * Acquire a lock and execute a function
   */
  async withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const duration = options.duration || 30000; // 30 seconds default
    const lockKey = `lock:${key}`;

    let lock;
    try {
      lock = await redlock.lock(lockKey, duration);
      logger.info(`Lock acquired: ${lockKey}`);

      try {
        return await fn();
      } finally {
        await lock.unlock().catch((err) => {
          logger.error(`Failed to unlock ${lockKey}`, { error: err.message });
        });
        logger.info(`Lock released: ${lockKey}`);
      }
    } catch (err) {
      if (err instanceof Redlock.LockError) {
        logger.warn(`Failed to acquire lock: ${lockKey}`, { error: err.message });
        throw new Error(`Could not acquire lock for ${key}`);
      }
      throw err;
    }
  },

  /**
   * Try to acquire a lock without retries
   */
  async tryLock(key: string, duration: number = 30000): Promise<Redlock.Lock | null> {
    const lockKey = `lock:${key}`;
    try {
      const lock = await redlock.lock(lockKey, duration);
      logger.info(`Lock acquired: ${lockKey}`);
      return lock;
    } catch (err) {
      if (err instanceof Redlock.LockError) {
        logger.warn(`Lock already held: ${lockKey}`);
        return null;
      }
      throw err;
    }
  },

  /**
   * Release a lock manually
   */
  async releaseLock(lock: Redlock.Lock): Promise<void> {
    try {
      await lock.unlock();
      logger.info(`Lock released manually`);
    } catch (err) {
      logger.error(`Failed to release lock`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
