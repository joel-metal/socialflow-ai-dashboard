import { FeatureService } from '../FeatureService';
import { dynamicConfigService } from '../DynamicConfigService';

jest.mock('../DynamicConfigService', () => ({
  dynamicConfigService: {
    get: jest.fn(),
    set: jest.fn(),
    getStatus: jest.fn(() => ({ cachedKeys: [] })),
  },
}));

const mockGet = dynamicConfigService.get as jest.Mock;

describe('FeatureService.hashBucket – FNV-1a distribution', () => {
  // Access private method via cast
  const svc = new FeatureService() as any;

  it('returns a value in [0, 99] for any input', () => {
    for (let i = 0; i < 200; i++) {
      const bucket = svc.hashBucket('flag', String(i));
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('distributes 1000 sequential integer user IDs evenly across buckets', () => {
    const counts = new Array(100).fill(0);
    for (let i = 0; i < 1000; i++) {
      counts[svc.hashBucket('rollout', String(i))]++;
    }
    // With 1000 users across 100 buckets the expected count is 10.
    // Allow ±8 variance (80 % tolerance) to confirm no severe clustering.
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(18);
    }
  });

  it('is deterministic – same inputs always produce the same bucket', () => {
    expect(svc.hashBucket('feat', '42')).toBe(svc.hashBucket('feat', '42'));
    expect(svc.hashBucket('feat', '1')).toBe(svc.hashBucket('feat', '1'));
  });

  it('produces different buckets for different flag names with the same user ID', () => {
    const b1 = svc.hashBucket('flag-a', '100');
    const b2 = svc.hashBucket('flag-b', '100');
    // Not guaranteed to differ for every pair, but these specific values do
    expect(b1).not.toBe(b2);
  });
});

describe('FeatureService.isEnabled – canary strategy', () => {
  const svc = new FeatureService();

  it('always returns true when percentage is 100', () => {
    mockGet.mockReturnValue({ enabled: true, strategy: 'canary', percentage: 100 });
    expect(svc.isEnabled('flag', { userId: '1' })).toBe(true);
  });

  it('always returns false when percentage is 0', () => {
    mockGet.mockReturnValue({ enabled: true, strategy: 'canary', percentage: 0 });
    expect(svc.isEnabled('flag', { userId: '1' })).toBe(false);
  });
});
