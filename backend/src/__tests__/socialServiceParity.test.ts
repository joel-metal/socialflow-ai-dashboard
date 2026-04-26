/**
 * Social Service Parity Tests
 *
 * Contract tests that ensure TikTokService and LinkedInService expose the same
 * interface as TwitterService: isConfigured, healthCheck, getCircuitStatus.
 *
 * These tests catch interface regressions without requiring live API credentials.
 */

// opossum is not installed in this environment — virtual mock prevents resolution failure
jest.mock('opossum', () => jest.fn().mockImplementation(() => ({
  fire: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  on: jest.fn(),
  open: jest.fn(),
  close: jest.fn(),
  clearCache: jest.fn(),
  shutdown: jest.fn(),
  opened: false,
  halfOpen: false,
  stats: { failures: 0, successes: 0, rejects: 0, fires: 0, fallbacks: 0, latencies: {} },
  latencyMean: 0,
})), { virtual: true });

jest.mock('../queues/SocialWorker', () => ({
  createSocialWorker: jest.fn().mockReturnValue({
    run: jest.fn().mockResolvedValue({ result: null, error: null, attempts: 1 }),
  }),
  extractRetryDelay: jest.fn().mockReturnValue(null),
}));

jest.mock('../services/DynamicConfigService', () => ({
  dynamicConfigService: {
    get: jest.fn().mockReturnValue(''),
    set: jest.fn().mockResolvedValue(undefined),
    onChange: jest.fn().mockReturnValue(() => {}),
    refreshCache: jest.fn().mockResolvedValue(undefined),
    startPolling: jest.fn(),
    stopPolling: jest.fn(),
    getStatus: jest.fn().mockReturnValue({ lastRefresh: null, isPolling: false, keysCachedCount: 0, cachedKeys: [] }),
  },
  ConfigKey: {
    TWITTER_WEBHOOK_SECRET: 'TWITTER_WEBHOOK_SECRET',
    RATE_LIMIT_MAX: 'RATE_LIMIT_MAX',
    RATE_LIMIT_WINDOW_MS: 'RATE_LIMIT_WINDOW_MS',
    FEATURE_SENTIMENT_ANALYSIS: 'FEATURE_SENTIMENT_ANALYSIS',
    FEATURE_AI_GENERATOR: 'FEATURE_AI_GENERATOR',
    MAINTENANCE_MODE: 'MAINTENANCE_MODE',
    CACHE_TTL: 'CACHE_TTL',
  },
}));

jest.mock('../services/CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    getStats: jest.fn().mockReturnValue({
      name: 'mock', state: 'closed', failures: 0, successes: 0,
      rejects: 0, fires: 0, fallbacks: 0,
      latency: { mean: 0, median: 0, p95: 0, p99: 0 },
    }),
    isOpen: jest.fn().mockReturnValue(false),
    open: jest.fn(),
    close: jest.fn(),
    resetAll: jest.fn(),
  },
}));

import { tiktokService, TikTokService } from '../services/TikTokService';
import { linkedinService, LinkedInService } from '../services/LinkedInService';
import { twitterService } from '../services/TwitterService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertContractShape(service: unknown): void {
  const s = service as Record<string, unknown>;
  expect(typeof s['isConfigured']).toBe('function');
  expect(typeof s['healthCheck']).toBe('function');
  expect(typeof s['getCircuitStatus']).toBe('function');
}

// ── Contract: method signatures ──────────────────────────────────────────────

describe('Social service contract — method signatures', () => {
  it('TwitterService exposes the required contract methods', () => {
    assertContractShape(twitterService);
  });

  it('TikTokService exposes the required contract methods', () => {
    assertContractShape(tiktokService);
  });

  it('LinkedInService exposes the required contract methods', () => {
    assertContractShape(linkedinService);
  });
});

// ── isConfigured ─────────────────────────────────────────────────────────────

describe('isConfigured()', () => {
  describe('TikTokService', () => {
    it('returns false when TIKTOK_ACCESS_TOKEN is not set', () => {
      const original = process.env.TIKTOK_ACCESS_TOKEN;
      delete process.env.TIKTOK_ACCESS_TOKEN;
      expect(new TikTokService().isConfigured()).toBe(false);
      process.env.TIKTOK_ACCESS_TOKEN = original;
    });

    it('returns false when TIKTOK_ACCESS_TOKEN is the placeholder value', () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'your_tiktok_access_token';
      expect(new TikTokService().isConfigured()).toBe(false);
      delete process.env.TIKTOK_ACCESS_TOKEN;
    });

    it('returns true when TIKTOK_ACCESS_TOKEN is a real value', () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'real-token-abc123';
      expect(new TikTokService().isConfigured()).toBe(true);
      delete process.env.TIKTOK_ACCESS_TOKEN;
    });
  });

  describe('LinkedInService', () => {
    it('returns false when LINKEDIN_ACCESS_TOKEN is not set', () => {
      const original = process.env.LINKEDIN_ACCESS_TOKEN;
      delete process.env.LINKEDIN_ACCESS_TOKEN;
      expect(new LinkedInService().isConfigured()).toBe(false);
      process.env.LINKEDIN_ACCESS_TOKEN = original;
    });

    it('returns false when LINKEDIN_ACCESS_TOKEN is the placeholder value', () => {
      process.env.LINKEDIN_ACCESS_TOKEN = 'your_linkedin_access_token';
      expect(new LinkedInService().isConfigured()).toBe(false);
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    });

    it('returns true when LINKEDIN_ACCESS_TOKEN is a real value', () => {
      process.env.LINKEDIN_ACCESS_TOKEN = 'real-token-xyz789';
      expect(new LinkedInService().isConfigured()).toBe(true);
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    });
  });
});

// ── healthCheck ───────────────────────────────────────────────────────────────

describe('healthCheck()', () => {
  describe('TikTokService', () => {
    it('returns false when not configured', async () => {
      delete process.env.TIKTOK_ACCESS_TOKEN;
      await expect(new TikTokService().healthCheck()).resolves.toBe(false);
    });

    it('returns false when getUserInfo throws', async () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'real-token';
      const svc = new TikTokService();
      jest.spyOn(svc, 'getUserInfo').mockRejectedValueOnce(new Error('network error'));
      await expect(svc.healthCheck()).resolves.toBe(false);
      delete process.env.TIKTOK_ACCESS_TOKEN;
    });

    it('returns false when getUserInfo returns null', async () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'real-token';
      const svc = new TikTokService();
      jest.spyOn(svc, 'getUserInfo').mockResolvedValueOnce(null);
      await expect(svc.healthCheck()).resolves.toBe(false);
      delete process.env.TIKTOK_ACCESS_TOKEN;
    });

    it('returns true when getUserInfo resolves with a user', async () => {
      process.env.TIKTOK_ACCESS_TOKEN = 'real-token';
      const svc = new TikTokService();
      jest.spyOn(svc, 'getUserInfo').mockResolvedValueOnce({
        open_id: 'abc', union_id: 'xyz', display_name: 'Test User',
      });
      await expect(svc.healthCheck()).resolves.toBe(true);
      delete process.env.TIKTOK_ACCESS_TOKEN;
    });
  });

  describe('LinkedInService', () => {
    it('returns false when not configured', async () => {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
      await expect(new LinkedInService().healthCheck()).resolves.toBe(false);
    });

    it('returns false when getProfile throws', async () => {
      process.env.LINKEDIN_ACCESS_TOKEN = 'real-token';
      const svc = new LinkedInService();
      jest.spyOn(svc, 'getProfile').mockRejectedValueOnce(new Error('network error'));
      await expect(svc.healthCheck()).resolves.toBe(false);
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    });

    it('returns false when getProfile returns null', async () => {
      process.env.LINKEDIN_ACCESS_TOKEN = 'real-token';
      const svc = new LinkedInService();
      jest.spyOn(svc, 'getProfile').mockResolvedValueOnce(null);
      await expect(svc.healthCheck()).resolves.toBe(false);
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    });

    it('returns true when getProfile resolves with a profile', async () => {
      process.env.LINKEDIN_ACCESS_TOKEN = 'real-token';
      const svc = new LinkedInService();
      jest.spyOn(svc, 'getProfile').mockResolvedValueOnce({
        id: 'abc123', localizedFirstName: 'Jane', localizedLastName: 'Doe',
      });
      await expect(svc.healthCheck()).resolves.toBe(true);
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    });
  });
});

// ── getCircuitStatus ──────────────────────────────────────────────────────────

describe('getCircuitStatus()', () => {
  it('TikTokService.getCircuitStatus() returns a value without throwing', () => {
    expect(() => tiktokService.getCircuitStatus()).not.toThrow();
  });

  it('LinkedInService.getCircuitStatus() returns a value without throwing', () => {
    expect(() => linkedinService.getCircuitStatus()).not.toThrow();
  });

  it('TwitterService.getCircuitStatus() returns a value without throwing', () => {
    expect(() => twitterService.getCircuitStatus()).not.toThrow();
  });
});

// ── API methods throw when not configured ─────────────────────────────────────

describe('API methods throw when not configured', () => {
  it('TikTokService.getUserInfo throws when not configured', async () => {
    delete process.env.TIKTOK_ACCESS_TOKEN;
    await expect(new TikTokService().getUserInfo()).rejects.toThrow('TikTok API not configured');
  });

  it('TikTokService.listVideos throws when not configured', async () => {
    delete process.env.TIKTOK_ACCESS_TOKEN;
    await expect(new TikTokService().listVideos()).rejects.toThrow('TikTok API not configured');
  });

  it('LinkedInService.getProfile throws when not configured', async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    await expect(new LinkedInService().getProfile()).rejects.toThrow('LinkedIn API not configured');
  });

  it('LinkedInService.createPost throws when not configured', async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    await expect(new LinkedInService().createPost({ text: 'hello' })).rejects.toThrow('LinkedIn API not configured');
  });
});
