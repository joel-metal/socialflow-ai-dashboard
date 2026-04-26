// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { Language, TranslationRequest, TranslationResult } from '../models';

export class TranslationService {
  static translate(body: TranslationRequest): Promise<TranslationResult> {
    return request(OpenAPI, { method: 'POST', url: '/api/translation/translate', body });
  }

  static getSupportedLanguages(): Promise<{ languages?: Language[] }> {
    return request(OpenAPI, { method: 'GET', url: '/api/translation/languages' });
  }

  static detectLanguage(body: { text: string }): Promise<{ detectedLanguage?: string; languageName?: string }> {
    return request(OpenAPI, { method: 'POST', url: '/api/translation/detect', body });
  }

  static batchTranslate(body: {
    texts: string[];
    sourceLanguage?: string;
    targetLanguages: string[];
  }): Promise<{ translations?: TranslationResult[]; totalTexts?: number; duration?: number }> {
    return request(OpenAPI, { method: 'POST', url: '/api/translation/batch', body });
  }

  static getTranslationProviders(): Promise<{ providers?: Array<{ name?: string; available?: boolean; characterLimit?: number; languages?: string[] }> }> {
    return request(OpenAPI, { method: 'GET', url: '/api/translation/providers' });
  }
}
