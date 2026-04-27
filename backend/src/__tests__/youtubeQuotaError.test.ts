/**
 * #620 — YouTubeService quota exhaustion error with reset time
 */
import nock from 'nock';

process.env.YOUTUBE_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';

// Override the moduleNameMapper stub so errors propagate (quota errors must not be swallowed by fallback)
jest.mock('../services/CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn(async (_n: string, fn: () => any) => fn()),
    getStats: jest.fn(() => ({})),
  },
}));

import { youTubeService, YouTubeQuotaError } from '../services/YouTubeService';

const API = 'https://www.googleapis.com';

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());
afterEach(() => nock.cleanAll());

const quotaErrorBody = {
  error: {
    code: 403,
    errors: [{ domain: 'youtube.quota', reason: 'quotaExceeded', message: 'The caller does not have permission' }],
  },
};

describe('YouTubeService — quota exhaustion', () => {
  it('getChannel throws YouTubeQuotaError with retryAfter on 403 quota-exceeded', async () => {
    nock(API).get('/youtube/v3/channels').query(true).reply(403, quotaErrorBody);

    let caught: any;
    try {
      await youTubeService.getChannel('token');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(YouTubeQuotaError);
    expect(caught.retryAfter).toBeInstanceOf(Date);
    expect(caught.retryAfter.getTime()).toBeGreaterThan(Date.now());
    expect(caught.message).toMatch(/quota/i);
  });

  it('getVideoStats throws YouTubeQuotaError on 403 dailyLimitExceeded', async () => {
    const body = {
      error: {
        code: 403,
        errors: [{ domain: 'youtube.quota', reason: 'dailyLimitExceeded', message: 'Daily limit exceeded' }],
      },
    };
    nock(API).get('/youtube/v3/videos').query(true).reply(403, body);

    await expect(youTubeService.getVideoStats('token', ['vid1'])).rejects.toThrow(YouTubeQuotaError);
  });

  it('listChannelVideos throws YouTubeQuotaError on 403 quota-exceeded', async () => {
    nock(API).get('/youtube/v3/search').query(true).reply(403, quotaErrorBody);

    await expect(youTubeService.listChannelVideos('token')).rejects.toThrow(YouTubeQuotaError);
  });

  it('getChannel throws a plain error on non-quota 403', async () => {
    nock(API).get('/youtube/v3/channels').query(true).reply(403, {
      error: { code: 403, errors: [{ domain: 'youtube', reason: 'forbidden', message: 'Forbidden' }] },
    });

    let caught: any;
    try { await youTubeService.getChannel('token'); } catch (e) { caught = e; }

    expect(caught).not.toBeInstanceOf(YouTubeQuotaError);
    expect(caught.message).toMatch(/YouTube API error/);
  });

  it('retryAfter is in the future (next midnight Pacific)', async () => {
    nock(API).get('/youtube/v3/channels').query(true).reply(403, quotaErrorBody);

    let quotaErr: YouTubeQuotaError | undefined;
    try {
      await youTubeService.getChannel('token');
    } catch (e: any) {
      quotaErr = e;
    }

    expect(quotaErr).toBeInstanceOf(YouTubeQuotaError);
    // Reset time must be at least 1 minute in the future and at most 25 hours away
    const diffMs = quotaErr!.retryAfter.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(60_000);
    expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000);
  });
});
