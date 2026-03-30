import { useState, useCallback } from 'react';
import { translationService } from '../services/TranslationService';
import { TranslationRequest, TranslationResult } from '@socialflow/shared';

export function useTranslation() {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(async (request: TranslationRequest) => {
    setLoading(true);
    setError(null);

    try {
      const translationResult = await translationService.translate(request);
      setResult(translationResult);
      return translationResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      console.error('Translation error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    translate,
    reset,
  };
}
