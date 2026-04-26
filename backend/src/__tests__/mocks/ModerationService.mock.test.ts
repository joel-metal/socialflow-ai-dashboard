/**
 * ModerationService — nock-based tests.
 * Verifies flagging logic, hard-block categories, and error handling
 * without hitting the real OpenAI API.
 */
import nock from 'nock';
import { mockModeration } from '../mocks/moderationMock';

process.env.OPENAI_API_KEY = 'test-openai-key';

import { ModerationService } from '../../services/ModerationService';

beforeAll(() => { nock.disableNetConnect(); });
afterAll(() => { nock.enableNetConnect(); });
afterEach(() => {
  nock.cleanAll();
  delete process.env.MODERATION_SENSITIVITY;
});

describe('ModerationService.moderate', () => {
  it('returns clean result for safe content', async () => {
    mockModeration.clean();
    const result = await ModerationService.moderate('Hello world');
    expect(result.flagged).toBe(false);
    expect(result.blocked).toBe(false);
  });

  it('flags content that exceeds threshold', async () => {
    process.env.MODERATION_SENSITIVITY = 'medium';
    mockModeration.flagged();
    const result = await ModerationService.moderate('hateful content');
    expect(result.flagged).toBe(true);
  });

  it('hard-blocks always-blocked categories regardless of sensitivity', async () => {
    process.env.MODERATION_SENSITIVITY = 'low';
    mockModeration.blocked();
    const result = await ModerationService.moderate('harmful content');
    expect(result.blocked).toBe(true);
  });

  it('throws on 500 server error', async () => {
    mockModeration.serverError();
    await expect(ModerationService.moderate('test')).rejects.toThrow('Moderation API returned 500');
  });

  it('throws on 429 rate-limited', async () => {
    mockModeration.rateLimited();
    await expect(ModerationService.moderate('test')).rejects.toThrow('Moderation API returned 429');
  });

  it('skips moderation when OPENAI_API_KEY is not set', async () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await ModerationService.moderate('anything');
    expect(result.flagged).toBe(false);
    expect(result.blocked).toBe(false);
    process.env.OPENAI_API_KEY = key;
  });
});
