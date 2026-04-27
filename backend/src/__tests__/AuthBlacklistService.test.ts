// Tests for AuthBlacklistService Redis singleton

import { getRedis } from '../services/AuthBlacklistService';

describe('AuthBlacklistService Redis Singleton', () => {
  it('returns the same Redis client instance on repeated calls', () => {
    const client1 = getRedis();
    const client2 = getRedis();
    expect(client1).toBe(client2);
  });
});