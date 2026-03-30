/**
 * integrationStatus unit tests
 */
import { checkIntegrations, getIntegrationSnapshot, _resetSnapshot } from '../../lib/integrationStatus';

// Minimal env so config validation passes
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars!!!!!';
process.env.TWITTER_API_KEY = 'test-key';
process.env.TWITTER_API_SECRET = 'test-secret';

jest.mock('../../lib/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// Re-import logger mock so we can spy on warn
import { createLogger } from '../../lib/logger';
const mockLogger = createLogger('integration-status');

beforeEach(() => {
  _resetSnapshot();
  jest.clearAllMocks();
  // Clear integration-related env vars
  delete process.env.REQUIRE_INTEGRATIONS;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe('checkIntegrations — disabled integrations', () => {
  it('returns enabled=false for unconfigured integrations', () => {
    const states = checkIntegrations();
    const youtube = states.find((s) => s.name === 'youtube')!;
    expect(youtube.enabled).toBe(false);
    expect(youtube.reason).toBeTruthy();
  });

  it('emits a warn log for each disabled integration', () => {
    checkIntegrations();
    expect(mockLogger.warn).toHaveBeenCalled();
    // Every warn call should mention the integration name
    const calls = (mockLogger.warn as jest.Mock).mock.calls;
    expect(calls.some((c: any[]) => c[0].includes('youtube'))).toBe(true);
  });

  it('returns enabled=true when credentials are present', () => {
    process.env.YOUTUBE_CLIENT_ID = 'id';
    process.env.YOUTUBE_CLIENT_SECRET = 'secret';
    // Reset config singleton so it picks up new env
    jest.resetModules();
    const { checkIntegrations: check, _resetSnapshot: reset } = require('../../lib/integrationStatus');
    reset();
    const states = check();
    const youtube = states.find((s: any) => s.name === 'youtube')!;
    expect(youtube.enabled).toBe(true);
    expect(youtube.reason).toBeUndefined();
  });
});

describe('checkIntegrations — REQUIRE_INTEGRATIONS policy', () => {
  it('throws when a required integration is not configured', () => {
    process.env.REQUIRE_INTEGRATIONS = 'youtube';
    expect(() => checkIntegrations()).toThrow(/Required integrations are not configured: youtube/);
  });

  it('does not throw when required integration is configured', () => {
    process.env.YOUTUBE_CLIENT_ID = 'id';
    process.env.YOUTUBE_CLIENT_SECRET = 'secret';
    process.env.REQUIRE_INTEGRATIONS = 'youtube';
    jest.resetModules();
    const { checkIntegrations: check, _resetSnapshot: reset } = require('../../lib/integrationStatus');
    reset();
    expect(() => check()).not.toThrow();
  });

  it('does not throw when REQUIRE_INTEGRATIONS is empty', () => {
    process.env.REQUIRE_INTEGRATIONS = '';
    expect(() => checkIntegrations()).not.toThrow();
  });
});

describe('getIntegrationSnapshot', () => {
  it('returns null before checkIntegrations is called', () => {
    expect(getIntegrationSnapshot()).toBeNull();
  });

  it('returns the cached result after checkIntegrations is called', () => {
    checkIntegrations();
    const snapshot = getIntegrationSnapshot();
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot!.length).toBeGreaterThan(0);
  });
});
