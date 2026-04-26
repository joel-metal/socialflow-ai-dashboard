/**
 * Tests for Gemini image size validation (#628)
 *
 * Covers:
 *  1. Image below 20 MB — passes size check (throws NOT_CONFIGURED, not VALIDATION_ERROR)
 *  2. Image exactly at 20 MB — passes size check
 *  3. Image above 20 MB — throws ValidationError with VALIDATION_ERROR code
 */

import { analyzeImage, ValidationError } from '../services/geminiService';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** Build a base64 string that decodes to exactly `bytes` bytes. */
function base64OfBytes(bytes: number): string {
  const remainder = bytes % 3;
  const fullGroups = Math.floor(bytes / 3);
  const padding = remainder === 0 ? 0 : 3 - remainder;
  const dataChars = fullGroups * 4 + (remainder > 0 ? 4 : 0);
  return 'A'.repeat(dataChars - padding) + '='.repeat(padding);
}

describe('analyzeImage — image size validation', () => {
  it('passes size check for an image below 20 MB (throws NOT_CONFIGURED, not VALIDATION_ERROR)', async () => {
    const imageData = base64OfBytes(MAX_BYTES - 1);

    await expect(analyzeImage(imageData)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('passes size check for an image exactly at 20 MB', async () => {
    const imageData = base64OfBytes(MAX_BYTES);

    await expect(analyzeImage(imageData)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('throws ValidationError for an image above 20 MB', async () => {
    const imageData = base64OfBytes(MAX_BYTES + 1);

    await expect(analyzeImage(imageData)).rejects.toThrow(ValidationError);
    await expect(analyzeImage(imageData)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
