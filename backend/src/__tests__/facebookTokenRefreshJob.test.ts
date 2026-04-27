/**
 * #618 — Facebook long-lived token refresh BullMQ job
 */

// ── mock ioredis ─────────────────────────────────────────────────────────────
type HashStore = Record<string, Record<string, string>>;
const hashStore: HashStore = {};

const mockRedis = {
  scan: jest.fn(),
  hgetall: jest.fn(async (key: string) => hashStore[key] ?? {}),
  hset: jest.fn(async (key: string, data: Record<string, string>) => {
    if (!hashStore[key]) hashStore[key] = {};
    Object.assign(hashStore[key], data);
    return 1;
  }),
  expireat: jest.fn(async () => 1),
};
jest.mock('ioredis', () => jest.fn(() => mockRedis));
jest.mock('../config/runtime', () => ({ getRedisConnection: () => ({}) }));

// ── mock BullMQ ───────────────────────────────────────────────────────────────
let capturedProcessor: ((job: any) => Promise<any>) | null = null;
const mockQueue = { add: jest.fn(), close: jest.fn() };
const mockWorker = { on: jest.fn(), close: jest.fn() };

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => mockQueue),
  Worker: jest.fn((_name: string, processor: (job: any) => Promise<any>) => {
    capturedProcessor = processor;
    return mockWorker;
  }),
}));

// ── mock FacebookService ──────────────────────────────────────────────────────
const mockGetLongLivedUserToken = jest.fn();
jest.mock('../services/FacebookService', () => ({
  facebookService: {
    isConfigured: () => true,
    getLongLivedUserToken: mockGetLongLivedUserToken,
  },
}));

import { startFacebookTokenRefreshJob, FACEBOOK_TOKEN_KEY } from '../jobs/facebookTokenRefreshJob';

const NOW = Date.now();
const SOON = NOW + 5 * 24 * 60 * 60 * 1000;   // 5 days — within 10-day threshold
const LATER = NOW + 30 * 24 * 60 * 60 * 1000; // 30 days — outside threshold

// Start the job once; capturedProcessor is set by the Worker constructor mock
beforeAll(async () => {
  await startFacebookTokenRefreshJob();
});

beforeEach(() => {
  Object.keys(hashStore).forEach((k) => delete hashStore[k]);
  mockRedis.scan.mockReset();
  mockGetLongLivedUserToken.mockReset();
  mockRedis.hset.mockClear();
});

function setupScan(keys: string[]) {
  mockRedis.scan.mockResolvedValueOnce(['0', keys]);
}

describe('facebookTokenRefreshJob', () => {
  it('refreshes tokens expiring within 10 days', async () => {
    const key = FACEBOOK_TOKEN_KEY('user-1');
    hashStore[key] = { accessToken: 'old-token', expiresAt: String(SOON) };
    setupScan([key]);

    const newExpiry = NOW + 60 * 86400_000;
    mockGetLongLivedUserToken.mockResolvedValueOnce({ accessToken: 'new-token', expiresAt: newExpiry });

    const result = await capturedProcessor!({ id: 'job-1', data: {} });

    expect(mockGetLongLivedUserToken).toHaveBeenCalledWith('old-token');
    expect(mockRedis.hset).toHaveBeenCalledWith(key, {
      accessToken: 'new-token',
      expiresAt: String(newExpiry),
    });
    expect(result).toEqual({ refreshed: 1, failed: 0 });
  });

  it('skips tokens not expiring within 10 days', async () => {
    const key = FACEBOOK_TOKEN_KEY('user-2');
    hashStore[key] = { accessToken: 'valid-token', expiresAt: String(LATER) };
    setupScan([key]);

    const result = await capturedProcessor!({ id: 'job-2', data: {} });

    expect(mockGetLongLivedUserToken).not.toHaveBeenCalled();
    expect(result).toEqual({ refreshed: 0, failed: 0 });
  });

  it('counts failures without throwing when refresh fails', async () => {
    const key = FACEBOOK_TOKEN_KEY('user-3');
    hashStore[key] = { accessToken: 'expiring', expiresAt: String(SOON) };
    setupScan([key]);

    mockGetLongLivedUserToken.mockRejectedValueOnce(new Error('Facebook API error'));

    const result = await capturedProcessor!({ id: 'job-3', data: {} });

    expect(result).toEqual({ refreshed: 0, failed: 1 });
  });

  it('handles mixed success and failure across multiple tokens', async () => {
    const key1 = FACEBOOK_TOKEN_KEY('user-4');
    const key2 = FACEBOOK_TOKEN_KEY('user-5');
    hashStore[key1] = { accessToken: 'tok1', expiresAt: String(SOON) };
    hashStore[key2] = { accessToken: 'tok2', expiresAt: String(SOON) };
    setupScan([key1, key2]);

    mockGetLongLivedUserToken
      .mockResolvedValueOnce({ accessToken: 'new1', expiresAt: NOW + 60 * 86400_000 })
      .mockRejectedValueOnce(new Error('rate limited'));

    const result = await capturedProcessor!({ id: 'job-4', data: {} });

    expect(result).toEqual({ refreshed: 1, failed: 1 });
  });

  it('schedules a daily repeating job', () => {
    expect(mockQueue.add).toHaveBeenCalledWith(
      'refresh-facebook-tokens',
      {},
      expect.objectContaining({ repeat: expect.objectContaining({ pattern: expect.any(String) }) }),
    );
  });
});
