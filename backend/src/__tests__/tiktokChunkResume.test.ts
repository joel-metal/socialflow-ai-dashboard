/**
 * #619 — TikTokService.uploadChunk resume from last confirmed offset
 */

// ── mock ioredis ─────────────────────────────────────────────────────────────
type HashStore = Record<string, Record<string, string>>;
const hashStore: HashStore = {};
let ttls: Record<string, number> = {};

const mockRedis = {
  hget: jest.fn(async (key: string, field: string) => hashStore[key]?.[field] ?? null),
  hset: jest.fn(async (key: string, ...args: any[]) => {
    if (!hashStore[key]) hashStore[key] = {};
    // hset(key, field, value) or hset(key, { field: value })
    if (typeof args[0] === 'object') {
      Object.assign(hashStore[key], args[0]);
    } else {
      hashStore[key][args[0]] = args[1];
    }
    return 1;
  }),
  expire: jest.fn(async (key: string, ttl: number) => { ttls[key] = ttl; return 1; }),
  del: jest.fn(async (key: string) => { delete hashStore[key]; return 1; }),
};
jest.mock('ioredis', () => jest.fn(() => mockRedis));
jest.mock('../config/runtime', () => ({ getRedisConnection: () => ({}) }));
jest.mock('../services/CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn(async (_n: string, fn: () => any) => fn()),
    getStats: jest.fn(() => ({})),
  },
}));

import { tiktokService } from '../services/TikTokService';

const UPLOAD_URL = 'https://upload.tiktokapis.com/video/';
const SESSION_ID = 'session-abc-123';
const TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB
const TOTAL_CHUNKS = 3;

function makeChunk(size = 10 * 1024 * 1024) {
  return Buffer.alloc(size);
}

beforeEach(() => {
  Object.keys(hashStore).forEach((k) => delete hashStore[k]);
  ttls = {};
  jest.clearAllMocks();
});

describe('TikTokService.uploadChunk — resume from last confirmed offset', () => {
  it('uploads a chunk and marks it confirmed in Redis', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '',
    } as any);

    await tiktokService.uploadChunk(UPLOAD_URL, makeChunk(), 0, TOTAL_CHUNKS, TOTAL_SIZE, SESSION_ID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockRedis.hset).toHaveBeenCalledWith(
      `tiktok:upload:progress:${SESSION_ID}`,
      '0',
      '1',
    );
    expect(mockRedis.expire).toHaveBeenCalledWith(
      `tiktok:upload:progress:${SESSION_ID}`,
      86400,
    );
  });

  it('skips a chunk that is already confirmed (no fetch call)', async () => {
    // Pre-mark chunk 1 as confirmed
    hashStore[`tiktok:upload:progress:${SESSION_ID}`] = { '1': '1' };

    const fetchSpy = jest.spyOn(global, 'fetch');

    await tiktokService.uploadChunk(UPLOAD_URL, makeChunk(), 1, TOTAL_CHUNKS, TOTAL_SIZE, SESSION_ID);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resumes from the correct offset after a mid-upload failure', async () => {
    // Chunks 0 and 1 already confirmed; chunk 2 needs uploading
    hashStore[`tiktok:upload:progress:${SESSION_ID}`] = { '0': '1', '1': '1' };

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 206,
      text: async () => '',
    } as any);

    await tiktokService.uploadChunk(UPLOAD_URL, makeChunk(), 2, TOTAL_CHUNKS, TOTAL_SIZE, SESSION_ID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Verify Content-Range header starts at byte 20 MB
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Range']).toMatch(/^bytes 20971520-/);
  });

  it('throws and does not mark chunk confirmed on upload failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as any);

    await expect(
      tiktokService.uploadChunk(UPLOAD_URL, makeChunk(), 0, TOTAL_CHUNKS, TOTAL_SIZE, SESSION_ID),
    ).rejects.toThrow('Chunk 1/3 upload failed');

    expect(mockRedis.hset).not.toHaveBeenCalled();
  });

  it('clearUploadProgress removes the Redis key', async () => {
    hashStore[`tiktok:upload:progress:${SESSION_ID}`] = { '0': '1' };

    await tiktokService.clearUploadProgress(SESSION_ID);

    expect(mockRedis.del).toHaveBeenCalledWith(`tiktok:upload:progress:${SESSION_ID}`);
  });
});
