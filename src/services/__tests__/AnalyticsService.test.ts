/**
 * AnalyticsService tests
 *
 * Strategy: mock global.fetch and window token globals; exercise the
 * normalisation helpers, partial-failure handling, and rate-limit retry
 * paths without touching IndexedDB (analyticsDB is also mocked).
 */

import {
  AnalyticsService,
  analyticsDB,
  type PostAnalytics,
  type Platform,
} from '../AnalyticsService';

// ---------------------------------------------------------------------------
// Mock IndexedDB layer so tests don't need a real browser environment
// ---------------------------------------------------------------------------
jest.mock('../AnalyticsService', () => {
  const actual = jest.requireActual('../AnalyticsService');
  return {
    ...actual,
    analyticsDB: {
      init: jest.fn().mockResolvedValue(undefined),
      upsertMany: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([]),
      getByPlatform: jest.fn().mockResolvedValue([]),
      getByDateRange: jest.fn().mockResolvedValue([]),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function setTokens(overrides: Record<string, string> = {}) {
  (window as any).__TWITTER_BEARER_TOKEN__ = overrides.twitter ?? 'tw-token';
  (window as any).__LINKEDIN_ACCESS_TOKEN__ = overrides.linkedin ?? 'li-token';
  (window as any).__INSTAGRAM_ACCESS_TOKEN__ = overrides.instagram ?? 'ig-token';
  (window as any).__TIKTOK_ACCESS_TOKEN__ = overrides.tiktok ?? 'tt-token';
}

function clearTokens() {
  delete (window as any).__TWITTER_BEARER_TOKEN__;
  delete (window as any).__LINKEDIN_ACCESS_TOKEN__;
  delete (window as any).__INSTAGRAM_ACCESS_TOKEN__;
  delete (window as any).__TIKTOK_ACCESS_TOKEN__;
}

beforeEach(() => {
  jest.clearAllMocks();
  setTokens();
});

afterEach(() => clearTokens());

// ---------------------------------------------------------------------------
// Normalisation — Twitter
// ---------------------------------------------------------------------------
describe('Twitter normalisation', () => {
  it('maps public_metrics to PostAnalytics schema', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 'tw1',
            created_at: '2024-01-15T10:00:00.000Z',
            public_metrics: {
              like_count: 42,
              retweet_count: 10,
              quote_count: 5,
              impression_count: 1000,
              reply_count: 8,
            },
          },
        ],
      }),
    );

    const svc = new AnalyticsService();
    await svc.sync({ twitter: 'user123' });

    const [record] = (analyticsDB.upsertMany as jest.Mock).mock.calls[0][0] as PostAnalytics[];
    expect(record.id).toBe('twitter:tw1');
    expect(record.platform).toBe('twitter');
    expect(record.postId).toBe('tw1');
    expect(record.likes).toBe(42);
    expect(record.shares).toBe(15); // retweet + quote
    expect(record.views).toBe(1000);
    expect(record.comments).toBe(8);
    expect(record.syncedAt).toBeGreaterThan(0);
  });

  it('defaults missing metrics to 0', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'tw2', public_metrics: {} }] }),
    );

    const svc = new AnalyticsService();
    await svc.sync({ twitter: 'user123' });

    const [record] = (analyticsDB.upsertMany as jest.Mock).mock.calls[0][0] as PostAnalytics[];
    expect(record.likes).toBe(0);
    expect(record.shares).toBe(0);
    expect(record.views).toBe(0);
    expect(record.comments).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Normalisation — Instagram
// ---------------------------------------------------------------------------
describe('Instagram normalisation', () => {
  it('maps Graph API media fields to PostAnalytics schema', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 'ig1',
            timestamp: '2024-02-01T08:00:00.000Z',
            like_count: 99,
            comments_count: 12,
            impressions: 500,
          },
        ],
      }),
    );

    const svc = new AnalyticsService();
    await svc.sync({ instagram: 'ig-account' });

    const [record] = (analyticsDB.upsertMany as jest.Mock).mock.calls[0][0] as PostAnalytics[];
    expect(record.id).toBe('instagram:ig1');
    expect(record.platform).toBe('instagram');
    expect(record.likes).toBe(99);
    expect(record.shares).toBe(0); // Instagram doesn't expose shares
    expect(record.views).toBe(500);
    expect(record.comments).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Normalisation — TikTok
// ---------------------------------------------------------------------------
describe('TikTok normalisation', () => {
  it('maps statistics fields to PostAnalytics schema', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          videos: [
            {
              id: 'tt1',
              create_time: 1706784000, // Unix seconds
              statistics: {
                digg_count: 200,
                share_count: 30,
                play_count: 5000,
                comment_count: 25,
              },
            },
          ],
        },
        error: { code: 'ok' },
      }),
    );

    const svc = new AnalyticsService();
    await svc.sync({ tiktok: 'tt-account' });

    const [record] = (analyticsDB.upsertMany as jest.Mock).mock.calls[0][0] as PostAnalytics[];
    expect(record.id).toBe('tiktok:tt1');
    expect(record.platform).toBe('tiktok');
    expect(record.likes).toBe(200);
    expect(record.shares).toBe(30);
    expect(record.views).toBe(5000);
    expect(record.comments).toBe(25);
    expect(record.postedAt).toBe(1706784000 * 1000);
  });
});

// ---------------------------------------------------------------------------
// Partial failure — one platform fails, others succeed
// ---------------------------------------------------------------------------
describe('sync() partial failure', () => {
  it('stores successful platforms and logs errors for failed ones', async () => {
    // Twitter succeeds
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: 'tw3', public_metrics: { like_count: 1 } }] }),
      )
      // Instagram fails
      .mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const svc = new AnalyticsService();
    await svc.sync({ twitter: 'user1', instagram: 'ig1' });

    // upsertMany called once (only for twitter)
    expect(analyticsDB.upsertMany).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Analytics] sync failed'),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  it('does not throw even when all platforms fail', async () => {
    mockFetch.mockRejectedValue(new Error('All down'));

    const svc = new AnalyticsService();
    await expect(svc.sync({ twitter: 'u1', instagram: 'u2' })).resolves.toBeUndefined();
    expect(analyticsDB.upsertMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rate-limit handling — Twitter 429
// ---------------------------------------------------------------------------
describe('rate-limit handling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries after a 429 and eventually succeeds', async () => {
    const rateLimitRes: Response = {
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'retry-after' ? '1' : null) },
      json: () => Promise.resolve({}),
    } as unknown as Response;

    const successRes = jsonResponse({
      data: [{ id: 'tw4', public_metrics: { like_count: 5 } }],
    });

    mockFetch
      .mockResolvedValueOnce(rateLimitRes)
      .mockResolvedValueOnce(successRes);

    const svc = new AnalyticsService();
    const syncPromise = svc.sync({ twitter: 'user1' });

    // Advance past the retry-after delay (1 s) + base retry delay
    await jest.runAllTimersAsync();
    await syncPromise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(analyticsDB.upsertMany).toHaveBeenCalledTimes(1);
  });

  it('records a sync error after exhausting all retries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '0' },
      json: () => Promise.resolve({}),
    } as unknown as Response);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const svc = new AnalyticsService();
    const syncPromise = svc.sync({ twitter: 'user1' });
    await jest.runAllTimersAsync();
    await syncPromise;

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Missing token — returns empty array without calling fetch
// ---------------------------------------------------------------------------
describe('missing access token', () => {
  it('returns [] for twitter when token is absent', async () => {
    clearTokens();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const svc = new AnalyticsService();
    await svc.sync({ twitter: 'user1' });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(analyticsDB.upsertMany).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Analytics]'));

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// syncedAt is stamped by sync(), not by the fetcher
// ---------------------------------------------------------------------------
describe('syncedAt stamping', () => {
  it('sets syncedAt to the time sync() was called', async () => {
    const before = Date.now();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 'tw5', public_metrics: {} }] }),
    );

    const svc = new AnalyticsService();
    await svc.sync({ twitter: 'user1' });
    const after = Date.now();

    const [record] = (analyticsDB.upsertMany as jest.Mock).mock.calls[0][0] as PostAnalytics[];
    expect(record.syncedAt).toBeGreaterThanOrEqual(before);
    expect(record.syncedAt).toBeLessThanOrEqual(after);
  });
});
