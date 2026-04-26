export class GeminiServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
  }
}

export class ValidationError extends GeminiServiceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function analyzeImage(
  imageData: string,
  mimeType = 'image/jpeg',
  context?: string,
): Promise<string> {
  // Base64 encodes 3 bytes per 4 chars; strip padding to get exact byte count
  const padding = (imageData.match(/={1,2}$/) ?? [''])[0].length;
  const byteSize = Math.ceil(imageData.length * 3 / 4) - padding;

  if (byteSize > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `Image size ${byteSize} bytes exceeds the 20 MB limit`,
    );
  }

  throw new GeminiServiceError('Gemini API key not configured', 'NOT_CONFIGURED');
}
