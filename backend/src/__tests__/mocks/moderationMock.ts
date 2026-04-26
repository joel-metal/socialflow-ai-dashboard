/**
 * OpenAI Moderation API mock helpers using nock.
 *
 * Usage:
 *   import { mockModeration } from '../mocks/moderationMock';
 *   mockModeration.clean();    // content passes moderation
 *   mockModeration.flagged();  // content is flagged but not blocked
 *   mockModeration.blocked();  // content is hard-blocked
 */
import nock from 'nock';

const BASE = 'https://api.openai.com';

function scope() {
  return nock(BASE).matchHeader('authorization', /^Bearer /);
}

function makeResult(overrides: Partial<{
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}> = {}) {
  return {
    results: [{
      flagged: false,
      categories: {
        hate: false,
        'hate/threatening': false,
        'sexual/minors': false,
        violence: false,
        'violence/graphic': false,
        'self-harm/instructions': false,
      },
      category_scores: {
        hate: 0.01,
        'hate/threatening': 0.01,
        'sexual/minors': 0.01,
        violence: 0.01,
        'violence/graphic': 0.01,
        'self-harm/instructions': 0.01,
      },
      ...overrides,
    }],
  };
}

export const mockModeration = {
  /** Content passes — not flagged, not blocked */
  clean: () =>
    scope().post('/v1/moderations').reply(200, makeResult()),

  /** Content is flagged (threshold exceeded) but not hard-blocked */
  flagged: () =>
    scope().post('/v1/moderations').reply(200, makeResult({
      flagged: true,
      categories: { hate: true, 'hate/threatening': false, 'sexual/minors': false, violence: false, 'violence/graphic': false, 'self-harm/instructions': false },
      category_scores: { hate: 0.75, 'hate/threatening': 0.01, 'sexual/minors': 0.01, violence: 0.01, 'violence/graphic': 0.01, 'self-harm/instructions': 0.01 },
    })),

  /** Hard-blocked category — always blocked regardless of sensitivity */
  blocked: () =>
    scope().post('/v1/moderations').reply(200, makeResult({
      flagged: true,
      categories: { hate: false, 'hate/threatening': false, 'sexual/minors': true, violence: false, 'violence/graphic': false, 'self-harm/instructions': false },
      category_scores: { hate: 0.01, 'hate/threatening': 0.01, 'sexual/minors': 0.95, violence: 0.01, 'violence/graphic': 0.01, 'self-harm/instructions': 0.01 },
    })),

  /** API returns a server error */
  serverError: () =>
    scope().post('/v1/moderations').reply(500, { error: { message: 'Internal server error' } }),

  /** API returns 429 rate-limited */
  rateLimited: () =>
    scope().post('/v1/moderations').reply(429, { error: { message: 'Rate limit exceeded' } }),
};
