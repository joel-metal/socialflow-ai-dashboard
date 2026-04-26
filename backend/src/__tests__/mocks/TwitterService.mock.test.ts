/**
 * TwitterService — nock-based tests.
 * No real network requests are made; nock intercepts all fetch calls.
 */
import nock from 'nock';
import { mockTwitter } from '../mocks/twitterMock';

// Provide a bearer token so isConfigured() returns true
process.env.TWITTER_BEARER_TOKEN = 'test-bearer-token';

// Mock circuit breaker to pass through directly (no state machine in unit tests)
jest.mock('../../services/CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn(async (_name: string, fn: () => any, fallback: () => any) => {
      try { return await fn(); } catch (e) { return fallback ? fallback() : Promise.reject(e); }
    }),
    getStats: jest.fn(() => ({})),
  },
}));

jest.mock('../../utils/LockService', () => ({
  LockService: { withLock: jest.fn((_key: string, fn: () => any) => fn()) },
}));

import { twitterService } from '../../services/TwitterService';

beforeAll(() => { nock.disableNetConnect(); });
afterAll(() => { nock.enableNetConnect(); });
afterEach(() => { nock.cleanAll(); });

// ── postTweet ─────────────────────────────────────────────────────────────────
describe('TwitterService.postTweet', () => {
  it('returns the created tweet on success', async () => {
    mockTwitter.postTweet.success();
    const tweet = await twitterService.postTweet({ text: 'Hello world' });
    expect(tweet.id).toBe('tweet-1');
    expect(tweet.text).toBe('Hello world');
  });

  it('throws on 400 API error', async () => {
    mockTwitter.postTweet.error(400, 'Bad Request');
    await expect(twitterService.postTweet({ text: 'bad' })).rejects.toThrow('Twitter API error');
  });

  it('throws on 429 rate-limited', async () => {
    mockTwitter.postTweet.rateLimited();
    await expect(twitterService.postTweet({ text: 'hi' })).rejects.toThrow('Twitter API error');
  });

  it('throws on 500 server error', async () => {
    mockTwitter.postTweet.serverError();
    await expect(twitterService.postTweet({ text: 'hi' })).rejects.toThrow('Twitter API error');
  });
});

// ── getUserTimeline ───────────────────────────────────────────────────────────
describe('TwitterService.getUserTimeline', () => {
  it('returns tweets for a user', async () => {
    const tweets = [{ id: 't1', text: 'Tweet 1', created_at: '', author_id: 'u1' }];
    mockTwitter.getUserTimeline.success('user-1', tweets);
    const result = await twitterService.getUserTimeline('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('returns empty array when no tweets', async () => {
    mockTwitter.getUserTimeline.empty('user-2');
    const result = await twitterService.getUserTimeline('user-2');
    expect(result).toEqual([]);
  });

  it('returns fallback empty array on 429 (circuit breaker fallback)', async () => {
    mockTwitter.getUserTimeline.rateLimited('user-3');
    const result = await twitterService.getUserTimeline('user-3');
    expect(result).toEqual([]);
  });
});

// ── getUserInfo ───────────────────────────────────────────────────────────────
describe('TwitterService.getUserInfo', () => {
  it('returns user data on success', async () => {
    mockTwitter.getUserInfo.success('testuser');
    const user = await twitterService.getUserInfo('testuser');
    expect(user?.username).toBe('testuser');
  });

  it('throws on 404 not found', async () => {
    mockTwitter.getUserInfo.notFound('ghost');
    await expect(twitterService.getUserInfo('ghost')).rejects.toThrow('Twitter API error');
  });
});

// ── searchTweets ──────────────────────────────────────────────────────────────
describe('TwitterService.searchTweets', () => {
  it('returns matching tweets', async () => {
    const tweets = [{ id: 's1', text: 'nock test', created_at: '', author_id: 'u1' }];
    mockTwitter.searchTweets.success(tweets);
    const result = await twitterService.searchTweets('nock');
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array on 429 (circuit breaker fallback)', async () => {
    mockTwitter.searchTweets.rateLimited();
    const result = await twitterService.searchTweets('nock');
    expect(result).toEqual([]);
  });
});

// ── healthCheck ───────────────────────────────────────────────────────────────
describe('TwitterService.healthCheck', () => {
  it('returns true when API responds 200', async () => {
    mockTwitter.healthCheck.ok();
    expect(await twitterService.healthCheck()).toBe(true);
  });

  it('returns false when API responds 401', async () => {
    mockTwitter.healthCheck.fail();
    expect(await twitterService.healthCheck()).toBe(false);
  });
});
