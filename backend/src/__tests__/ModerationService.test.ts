/**
 * ModerationService — moderation mode behavior tests (#492)
 *
 * Covers:
 *   - Missing API key in fail-open vs fail-closed mode
 *   - Logger warn/error emission for bypass conditions
 *   - Provider timeout in both modes
 *   - Malformed API response in both modes
 */
import nock from 'nock';

const BASE = 'https://api.openai.com';

// ── Logger spy setup ──────────────────────────────────────────────────────────
// Must happen before the module is imported so the spy is in place at load time.
const warnSpy = jest.fn();
const errorSpy = jest.fn();

jest.mock('../lib/logger', () => ({
  createLogger: () => ({ warn: warnSpy, error: errorSpy, info: jest.fn() }),
}));

// Set a key so the module loads in "configured" state by default;
// individual tests override as needed.
process.env.OPENAI_API_KEY = 'test-key';

import { ModerationService } from '../services/ModerationService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanResponse() {
  return {
    results: [{
      flagged: false,
      categories: { hate: false, 'hate/threatening': false, 'sexual/minors': false, violence: false, 'violence/graphic': false, 'self-harm/instructions': false },
      category_scores: { hate: 0.01, 'hate/threatening': 0.01, 'sexual/minors': 0.01, violence: 0.01, 'violence/graphic': 0.01, 'self-harm/instructions': 0.01 },
    }],
  };
}

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());

afterEach(() => {
  nock.cleanAll();
  warnSpy.mockClear();
  errorSpy.mockClear();
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.MODERATION_MODE;
});

// ── Missing API key ───────────────────────────────────────────────────────────

describe('missing OPENAI_API_KEY', () => {
  beforeEach(() => { delete process.env.OPENAI_API_KEY; });

  it('fail-open (default): returns clean bypass result', async () => {
    const result = await ModerationService.moderate('hello');
    expect(result).toEqual({ flagged: false, blocked: false, categories: {}, scores: {} });
  });

  it('fail-open (default): emits a warn log', async () => {
    await ModerationService.moderate('hello');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OPENAI_API_KEY not set'),
    );
  });

  it('fail-closed: throws', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    await expect(ModerationService.moderate('hello')).rejects.toThrow(
      'Moderation unavailable: OPENAI_API_KEY not set',
    );
  });

  it('fail-closed: emits an error log before throwing', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    await ModerationService.moderate('hello').catch(() => {});
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('OPENAI_API_KEY not set'),
    );
  });
});

// ── Provider timeout ──────────────────────────────────────────────────────────

describe('provider timeout', () => {
  beforeEach(() => {
    // Simulate a connection timeout via nock
    nock(BASE).post('/v1/moderations').replyWithError({ code: 'ETIMEDOUT' });
  });

  it('fail-open (default): returns clean bypass result', async () => {
    const result = await ModerationService.moderate('hello');
    expect(result).toEqual({ flagged: false, blocked: false, categories: {}, scores: {} });
  });

  it('fail-open (default): emits error then warn logs', async () => {
    await ModerationService.moderate('hello');
    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
  });

  it('fail-closed: throws', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    await expect(ModerationService.moderate('hello')).rejects.toThrow();
  });

  it('fail-closed: does not emit a warn log (no bypass)', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    await ModerationService.moderate('hello').catch(() => {});
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('failing open'));
  });
});

// ── Malformed response ────────────────────────────────────────────────────────

describe('malformed API response', () => {
  it('fail-open (default): returns clean bypass result when body is not valid JSON', async () => {
    nock(BASE).post('/v1/moderations').reply(200, 'not-json', { 'content-type': 'text/plain' });
    const result = await ModerationService.moderate('hello');
    expect(result).toEqual({ flagged: false, blocked: false, categories: {}, scores: {} });
  });

  it('fail-open (default): returns clean bypass result when results array is missing', async () => {
    nock(BASE).post('/v1/moderations').reply(200, { unexpected: true });
    const result = await ModerationService.moderate('hello');
    expect(result).toEqual({ flagged: false, blocked: false, categories: {}, scores: {} });
  });

  it('fail-open (default): emits error and warn logs for malformed response', async () => {
    nock(BASE).post('/v1/moderations').reply(200, { unexpected: true });
    await ModerationService.moderate('hello');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('malformed'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
  });

  it('fail-closed: throws on malformed response', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    nock(BASE).post('/v1/moderations').reply(200, { unexpected: true });
    await expect(ModerationService.moderate('hello')).rejects.toThrow('malformed');
  });

  it('fail-closed: does not emit a warn log (no bypass)', async () => {
    process.env.MODERATION_MODE = 'fail-closed';
    nock(BASE).post('/v1/moderations').reply(200, { unexpected: true });
    await ModerationService.moderate('hello').catch(() => {});
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('failing open'));
  });

  it('succeeds normally when response is well-formed', async () => {
    nock(BASE).post('/v1/moderations').reply(200, cleanResponse());
    const result = await ModerationService.moderate('hello');
    expect(result.flagged).toBe(false);
    expect(result.blocked).toBe(false);
  });
});
