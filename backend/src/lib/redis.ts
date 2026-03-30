import Redis from 'ioredis';
import { getRedisConnection } from '../config/runtime';

/**
 * Singleton ioredis client built from the validated config singleton.
 * Import this instead of constructing `new Redis(process.env.*)` directly.
 */
export const redis = new Redis(getRedisConnection());
