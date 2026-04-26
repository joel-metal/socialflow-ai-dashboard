import {
  TranslationRequest,
  TranslationResult,
  Translation,
  PreservedElement,
  SupportedLanguage,
} from '@socialflow/shared';

/**
 * TranslationService - Backend translation service
 * Integrates with DeepL and Google Translate APIs
 */
class TranslationService {
  private readonly LANGUAGES: SupportedLanguage[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  ];

  /**
   * Translate content
   */
  public async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLanguage, targetLanguages } = request;

    const { processedText, preservedElements } = this.extractPreservedElements(text, request);
    const detectedSourceLang = sourceLanguage || (await this.detectLanguage(text));

    const translations: Translation[] = [];

    for (const targetLang of targetLanguages) {
      if (targetLang === detectedSourceLang) {
        translations.push({
          language: targetLang,
          languageName: this.getLanguageName(targetLang),
          text: text,
          confidence: 1.0,
        });
        continue;
      }

      try {
        let translatedText: string;

        // Try DeepL first
        if (this.isDeepLAvailable()) {
          translatedText = await this.translateWithDeepL(
            processedText,
            detectedSourceLang,
            targetLang,
          );
        } else if (this.isGoogleTranslateAvailable()) {
          translatedText = await this.translateWithGoogle(
            processedText,
            detectedSourceLang,
            targetLang,
          );
        } else {
          throw new Error('No translation provider available');
        }

        const finalText = this.restorePreservedElements(translatedText, preservedElements);

        translations.push({
          language: targetLang,
          languageName: this.getLanguageName(targetLang),
          text: finalText,
          confidence: 0.95,
        });
      } catch (error) {
        console.error(`Translation to ${targetLang} failed:`, error);
        translations.push({
          language: targetLang,
          languageName: this.getLanguageName(targetLang),
          text: text,
          confidence: 0,
        });
      }
    }

    return {
      originalText: text,
      sourceLanguage: detectedSourceLang,
      translations,
      preservedElements,
      provider: this.isDeepLAvailable() ? 'deepl' : 'google',
      timestamp: new Date(),
    };
  }

  /**
   * Extract preserved elements
   */
  private extractPreservedElements(
    text: string,
    options: TranslationRequest,
  ): { processedText: string; preservedElements: PreservedElement[] } {
    let processedText = text;
    const preservedElements: PreservedElement[] = [];
    let placeholderIndex = 0;

    if (options.preserveUrls !== false) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      processedText = processedText.replace(urlRegex, (match) => {
        const placeholder = `__URL_${placeholderIndex++}__`;
        preservedElements.push({ type: 'url', value: match, placeholder });
        return placeholder;
      });
    }

    if (options.preserveMentions !== false) {
      const mentionRegex = /@(\w+)/g;
      processedText = processedText.replace(mentionRegex, (match) => {
        const placeholder = `__MENTION_${placeholderIndex++}__`;
        preservedElements.push({ type: 'mention', value: match, placeholder });
        return placeholder;
      });
    }

    if (options.preserveHashtags !== false) {
      const hashtagRegex = /#(\w+)/g;
      processedText = processedText.replace(hashtagRegex, (match) => {
        const placeholder = `__HASHTAG_${placeholderIndex++}__`;
        preservedElements.push({ type: 'hashtag', value: match, placeholder });
        return placeholder;
      });
    }

    if (options.preserveEmojis !== false) {
      const emojiRegex =
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      processedText = processedText.replace(emojiRegex, (match) => {
        const placeholder = `__EMOJI_${placeholderIndex++}__`;
        preservedElements.push({ type: 'emoji', value: match, placeholder });
        return placeholder;
      });
    }

    return { processedText, preservedElements };
  }

  /**
   * Restore preserved elements
   */
  private restorePreservedElements(
    translatedText: string,
    preservedElements: PreservedElement[],
  ): string {
    let restoredText = translatedText;
    preservedElements.forEach((element) => {
      restoredText = restoredText.replace(element.placeholder, element.value);
    });
    return restoredText;
  }

  /**
   * Translate with DeepL
   */
  private async translateWithDeepL(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const apiKey = process.env.DEEPL_API_KEY;

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
        preserve_formatting: true,
      }),
    });

    const data = await response.json();
    return data.translations[0].text;
  }

  /**
   * Translate with Google Translate
   */
  private async translateWithGoogle(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: sourceLang,
          target: targetLang,
          format: 'text',
        }),
      },
    );

    const data = await response.json();
    return data.data.translations[0].translatedText;
  }

  /**
   * Detect language
   */
  private async detectLanguage(text: string): Promise<string> {
    if (/[а-яА-Я]/.test(text)) return 'ru';
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0900-\u097f]/.test(text)) return 'hi';
    return 'en';
  }

  /**
   * Get language name
   */
  private getLanguageName(code: string): string {
    const language = this.LANGUAGES.find((lang) => lang.code === code);
    return language?.name || code.toUpperCase();
  }

  /**
   * Check if DeepL is available
   */
  private isDeepLAvailable(): boolean {
    return !!process.env.DEEPL_API_KEY;
  }

  /**
   * Check if Google Translate is available
   */
  private isGoogleTranslateAvailable(): boolean {
    return !!process.env.GOOGLE_TRANSLATE_API_KEY;
  }

  /**
   * Get supported languages
   */
  public getSupportedLanguages(): SupportedLanguage[] {
    return this.LANGUAGES;
  }
}

export const translationService = new TranslationService();
