import Redis from 'ioredis';
import { getRedisConnection } from '../config/runtime';

const CACHE_PREFIX = 'cache:';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(getRedisConnection());
  }
  return _redis;
}

/**
 * Cache-Aside helper.
 * On miss: calls `fetcher`, stores the result with TTL, then returns it.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  const cacheKey = `${CACHE_PREFIX}${key}`;

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const value = await fetcher();
  if (value !== null && value !== undefined) {
    await redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds);
  }
  return value;
}

/** Delete one or more cache keys. Supports glob patterns via SCAN. */
export async function invalidateCache(...keys: string[]): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.del(`${CACHE_PREFIX}${key}`);
  }
  await pipeline.exec();
}

/** Delete all cache keys matching a pattern (e.g. "org:*"). */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const redis = getRedis();
  const fullPattern = `${CACHE_PREFIX}${pattern}`;
  let cursor = '0';
  const keys: string[] = [];

  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');

  if (keys.length > 0) {
    await redis.unlink(...keys);
  }
}

export const CacheTTL = {
  USER_PROFILE: 300,      // 5 minutes
  ORG: 300,               // 5 minutes
  ORG_LIST: 120,          // 2 minutes
  ANALYTICS: 60,          // 1 minute
  FEED: 30,               // 30 seconds
} as const;
