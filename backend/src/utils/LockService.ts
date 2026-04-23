import Redlock from 'redlock';
import Redis from 'ioredis';
import { createLogger } from '../lib/logger';

const logger = createLogger('lock-service');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
});

const redlock = new Redlock([redisClient as any], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
});

export interface LockOptions {
  duration?: number;
  retries?: number;
}

export const LockService = {
  /**
   * Acquire a lock and execute a function.
   * A background interval extends the lock TTL every TTL/2 ms so the lock
   * is held for the full duration of the operation even when it exceeds the
   * initial TTL.
   */
  async withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const duration = options.duration || 30000; // 30 seconds default
    const lockKey = `lock:${key}`;

    let lock;
    try {
      lock = await redlock.lock(lockKey, duration);
      logger.info(`Lock acquired: ${lockKey}`);

      // Extend the lock TTL every TTL/2 ms while the operation is running.
      let currentLock = lock;
      const extendInterval = setInterval(async () => {
        try {
          currentLock = await currentLock.extend(duration);
          logger.debug(`Lock extended: ${lockKey}`);
        } catch (extErr) {
          logger.warn(`Failed to extend lock: ${lockKey}`, {
            error: extErr instanceof Error ? extErr.message : String(extErr),
          });
        }
      }, Math.floor(duration / 2));

      try {
        return await fn();
      } finally {
        clearInterval(extendInterval);
        await currentLock.unlock().catch((err) => {
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
