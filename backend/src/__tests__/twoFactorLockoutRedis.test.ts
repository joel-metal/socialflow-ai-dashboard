// Tests for #610 — Redis-backed 2FA lockout store
// Verifies that lockout state persists across simulated restarts (new store instances)

import { redisTwoFactorLockoutStore } from '../services/TwoFactorLockoutService';

// Mock ioredis
const redisData = new Map<string, { value: string; expiresAt: number }>();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: async (key: string) => {
      const entry = redisData.get(key);
      const current = entry ? parseInt(entry.value, 10) : 0;
      const next = current + 1;
      redisData.set(key, { value: String(next), expiresAt: Infinity });
      return next;
    },
    expire: async (key: string, ttlSeconds: number) => {
      const entry = redisData.get(key);
      if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
    },
    set: async (key: string, value: string, _ex: string, ttlSeconds: number) => {
      redisData.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    get: async (key: string) => {
      const entry = redisData.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) { redisData.delete(key); return null; }
      return entry.value;
    },
    pttl: async (key: string) => {
      const entry = redisData.get(key);
      if (!entry) return -2;
      const remaining = entry.expiresAt - Date.now();
      return remaining > 0 ? remaining : -2;
    },
    del: async (...keys: string[]) => {
      keys.forEach(k => redisData.delete(k));
    },
  }));
});

jest.mock('../config/runtime', () => ({
  getRedisConnection: () => ({ host: '127.0.0.1', port: 6379 }),
}));

describe('#610 Redis-backed 2FA lockout store', () => {
  const userId = 'user-2fa-test';

  beforeEach(() => {
    redisData.clear();
  });

  it('is not locked out initially', async () => {
    expect(await redisTwoFactorLockoutStore.isLockedOut(userId)).toBe(false);
  });

  it('locks out after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await redisTwoFactorLockoutStore.recordFailedAttempt(userId);
    }
    expect(await redisTwoFactorLockoutStore.isLockedOut(userId)).toBe(true);
  });

  it('lockout persists across simulated restarts (new store reference reads same Redis data)', async () => {
    // Simulate 5 failures
    for (let i = 0; i < 5; i++) {
      await redisTwoFactorLockoutStore.recordFailedAttempt(userId);
    }

    // Simulate restart: re-import the module (same mock Redis data persists)
    jest.resetModules();
    const { redisTwoFactorLockoutStore: freshStore } = await import(
      '../services/TwoFactorLockoutService'
    );

    expect(await freshStore.isLockedOut(userId)).toBe(true);
  });

  it('returns remaining lockout time > 0 when locked', async () => {
    for (let i = 0; i < 5; i++) {
      await redisTwoFactorLockoutStore.recordFailedAttempt(userId);
    }
    const remaining = await redisTwoFactorLockoutStore.getLockoutRemainingMs(userId);
    expect(remaining).toBeGreaterThan(0);
  });

  it('clears lockout after resetFailedAttempts', async () => {
    for (let i = 0; i < 5; i++) {
      await redisTwoFactorLockoutStore.recordFailedAttempt(userId);
    }
    await redisTwoFactorLockoutStore.resetFailedAttempts(userId);
    expect(await redisTwoFactorLockoutStore.isLockedOut(userId)).toBe(false);
  });
});
