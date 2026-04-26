/**
 * Per-tenant moderation sensitivity thresholds (#629)
 *
 * Covers:
 *  1. Tenant with 'high' sensitivity receives a lower threshold (flags borderline content)
 *  2. Tenant with 'low' sensitivity receives a higher threshold (allows borderline content)
 *  3. Tenant with no config falls back to the global env var
 *  4. Different tenants in the same call receive different thresholds
 */
import nock from 'nock';

const BASE = 'https://api.openai.com';

// ── Mock DynamicConfigService before any imports ──────────────────────────────

const mockDynamicConfigGet = jest.fn();

jest.mock('../services/DynamicConfigService', () => ({
  ConfigKey: { MODERATION_SENSITIVITY: 'MODERATION_SENSITIVITY' },
  dynamicConfigService: { get: mockDynamicConfigGet },
}));

jest.mock('../lib/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

process.env.OPENAI_API_KEY = 'test-key';

import { ModerationService } from '../services/ModerationService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an OpenAI moderation response with a given score for the 'hate' category. */
function scoreResponse(hateScore: number) {
  return {
    results: [{
      flagged: false,
      categories: { hate: false, 'hate/threatening': false, 'sexual/minors': false, violence: false, 'violence/graphic': false, 'self-harm/instructions': false },
      category_scores: { hate: hateScore, 'hate/threatening': 0.01, 'sexual/minors': 0.01, violence: 0.01, 'violence/graphic': 0.01, 'self-harm/instructions': 0.01 },
    }],
  };
}

beforeAll(() => nock.disableNetConnect());
afterAll(() => nock.enableNetConnect());

afterEach(() => {
  nock.cleanAll();
  mockDynamicConfigGet.mockReset();
  delete process.env.MODERATION_SENSITIVITY;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('per-tenant moderation sensitivity', () => {
  it('tenant with high sensitivity flags borderline content (score 0.5 > threshold 0.3)', async () => {
    mockDynamicConfigGet.mockImplementation((key: string) =>
      key === 'tenant:tenant-strict:MODERATION_SENSITIVITY' ? 'high' : null,
    );
    nock(BASE).post('/v1/moderations').reply(200, scoreResponse(0.5));

    const result = await ModerationService.moderate('borderline text', 'tenant-strict');

    expect(result.flagged).toBe(true);
  });

  it('tenant with low sensitivity allows borderline content (score 0.5 < threshold 0.85)', async () => {
    mockDynamicConfigGet.mockImplementation((key: string) =>
      key === 'tenant:tenant-lenient:MODERATION_SENSITIVITY' ? 'low' : null,
    );
    nock(BASE).post('/v1/moderations').reply(200, scoreResponse(0.5));

    const result = await ModerationService.moderate('borderline text', 'tenant-lenient');

    expect(result.flagged).toBe(false);
  });

  it('tenant with no config falls back to global env var', async () => {
    mockDynamicConfigGet.mockReturnValue(null);
    process.env.MODERATION_SENSITIVITY = 'high';
    nock(BASE).post('/v1/moderations').reply(200, scoreResponse(0.5));

    const result = await ModerationService.moderate('borderline text', 'tenant-no-config');

    expect(result.flagged).toBe(true);
  });

  it('different tenants receive different thresholds for the same content', async () => {
    mockDynamicConfigGet.mockImplementation((key: string) => {
      if (key === 'tenant:strict:MODERATION_SENSITIVITY') return 'high';
      if (key === 'tenant:lenient:MODERATION_SENSITIVITY') return 'low';
      return null;
    });

    // Score 0.5: above high threshold (0.3), below low threshold (0.85)
    nock(BASE).post('/v1/moderations').reply(200, scoreResponse(0.5));
    const strictResult = await ModerationService.moderate('borderline text', 'strict');

    nock(BASE).post('/v1/moderations').reply(200, scoreResponse(0.5));
    const lenientResult = await ModerationService.moderate('borderline text', 'lenient');

    expect(strictResult.flagged).toBe(true);
    expect(lenientResult.flagged).toBe(false);
  });
});
