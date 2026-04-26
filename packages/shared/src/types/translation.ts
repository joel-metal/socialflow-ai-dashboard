/**
 * Canonical translation types shared between frontend and backend.
 * Import from this package in both frontend and backend to prevent type drift.
 */

export interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguages: string[];
  preserveFormatting?: boolean;
  preserveHashtags?: boolean;
  preserveMentions?: boolean;
  preserveUrls?: boolean;
  preserveEmojis?: boolean;
}

export interface TranslationResult {
  originalText: string;
  sourceLanguage: string;
  translations: Translation[];
  preservedElements: PreservedElement[];
  provider: 'deepl' | 'google' | 'gemini';
  timestamp: Date;
}

export interface Translation {
  language: string;
  languageName: string;
  text: string;
  confidence?: number;
}

export interface PreservedElement {
  type: 'url' | 'mention' | 'hashtag' | 'emoji';
  value: string;
  placeholder: string;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface TranslationProvider {
  name: string;
  available: boolean;
  languages: string[];
  characterLimit: number;
  rateLimit?: number;
}

export interface TranslationHistory {
  id: string;
  request: TranslationRequest;
  result: TranslationResult;
  timestamp: Date;
}

export interface BatchTranslationRequest {
  texts: string[];
  sourceLanguage?: string;
  targetLanguages: string[];
  preserveFormatting?: boolean;
}

export interface BatchTranslationResult {
  translations: TranslationResult[];
  totalCharacters: number;
  provider: string;
  duration: number;
}
