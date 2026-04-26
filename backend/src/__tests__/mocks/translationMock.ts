/**
 * DeepL & Google Translate API mock helpers using nock.
 *
 * Usage:
 *   import { mockTranslation } from '../mocks/translationMock';
 *   mockTranslation.deepl.success('Hola mundo');
 *   mockTranslation.google.success('Hola mundo');
 */
import nock from 'nock';

export const mockTranslation = {
  deepl: {
    success: (translatedText = 'Translated text') =>
      nock('https://api-free.deepl.com')
        .post('/v2/translate')
        .reply(200, { translations: [{ text: translatedText, detected_source_language: 'EN' }] }),

    rateLimited: () =>
      nock('https://api-free.deepl.com')
        .post('/v2/translate')
        .reply(429, { message: 'Too many requests' }),

    serverError: () =>
      nock('https://api-free.deepl.com')
        .post('/v2/translate')
        .reply(500, { message: 'Internal server error' }),
  },

  google: {
    success: (translatedText = 'Translated text') =>
      nock('https://translation.googleapis.com')
        .post('/language/translate/v2')
        .query(true)
        .reply(200, {
          data: { translations: [{ translatedText, detectedSourceLanguage: 'en' }] },
        }),

    rateLimited: () =>
      nock('https://translation.googleapis.com')
        .post('/language/translate/v2')
        .query(true)
        .reply(429, { error: { message: 'Rate Limit Exceeded' } }),
  },
};
