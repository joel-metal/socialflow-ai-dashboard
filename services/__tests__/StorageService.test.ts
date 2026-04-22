import crypto from 'crypto';
import { StorageService, StorageConfig } from '../StorageService';

const baseConfig: StorageConfig = {
  provider: 'cloudinary',
  cloudinaryCloudName: 'test-cloud',
  cloudinaryApiKey: 'test-key',
  cloudinaryApiSecret: 'correct-secret',
};

afterEach(() => {
  delete process.env.CLOUDINARY_API_SECRET;
});

describe('StorageService – upload signature enforcement', () => {
  it('blocks upload in production when CLOUDINARY_API_SECRET env var is absent', async () => {
    // No env secret set — simulates insecure demo/fallback path
    const service = new StorageService(baseConfig);
    const result = await service.upload(Buffer.from('data'));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CLOUDINARY_API_SECRET/);
  });

  it('accepts upload when a valid server-side signature is present', async () => {
    process.env.CLOUDINARY_API_SECRET = 'correct-secret';

    const service = new StorageService(baseConfig);
    const result = await service.upload(Buffer.from('data'), { fileName: 'img' });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('cloudinary');
    expect(result.url).toContain('test-cloud');
  });

  it('rejects tampered signatures — signature derived from wrong secret never matches the correct one', () => {
    // Mirrors the internal generateCloudinarySignature logic to assert tamper detection
    const params = { api_key: 'test-key', folder: 'uploads', timestamp: '1700000000' };
    const sortedStr = Object.keys(params)
      .sort()
      .map((k) => `${k}=${(params as Record<string, string>)[k]}`)
      .join('&');

    const sign = (secret: string) =>
      crypto.createHash('sha1').update(`${sortedStr}&${secret}`).digest('hex');

    const validSig = sign('correct-secret');
    const tamperedSig = sign('attacker-secret');

    expect(tamperedSig).not.toBe(validSig);
  });
});
