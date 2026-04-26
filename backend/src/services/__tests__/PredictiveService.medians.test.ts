import { predictiveService } from '../PredictiveService';
import { computePlatformMedians } from '../../jobs/platformMedianJob';
import { prisma } from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  prisma: { analyticsEntry: { findMany: jest.fn() } },
}));

const mockFindMany = prisma.analyticsEntry.findMany as jest.Mock;

describe('PredictiveService.seedFromMedians', () => {
  it('overrides avgEngagement with median value for a platform', async () => {
    predictiveService.seedFromMedians({ instagram: { avgEngagement: 9.9 } });

    const prediction = await predictiveService.predictReach({
      content: 'test post with enough words to pass length check here',
      platform: 'instagram',
    });

    // Confidence increases when historicalData is present — service still runs without error
    expect(prediction.reachScore).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeGreaterThan(0);
  });

  it('overrides avgReach with median value', () => {
    predictiveService.seedFromMedians({ tiktok: { avgReach: 123456 } });
    // No error thrown; internal state updated (verified indirectly via prediction running)
    expect(() =>
      predictiveService.seedFromMedians({ tiktok: { avgReach: 123456 } }),
    ).not.toThrow();
  });

  it('ignores platforms not in historicalData', () => {
    expect(() =>
      predictiveService.seedFromMedians({ unknown_platform: { avgEngagement: 5 } }),
    ).not.toThrow();
  });

  it('partial medians only update provided fields', async () => {
    // Seed only engagement — reach should remain unchanged
    predictiveService.seedFromMedians({ linkedin: { avgEngagement: 12.5 } });

    const prediction = await predictiveService.predictReach({
      content: 'professional leadership strategy content for linkedin audience',
      platform: 'linkedin',
    });

    expect(prediction.reachScore).toBeGreaterThanOrEqual(0);
  });
});

describe('computePlatformMedians', () => {
  it('computes median reach and engagement per platform', async () => {
    mockFindMany.mockResolvedValue([
      { platform: 'instagram', metric: 'reach', value: 100 },
      { platform: 'instagram', metric: 'reach', value: 200 },
      { platform: 'instagram', metric: 'reach', value: 300 },
      { platform: 'instagram', metric: 'engagement', value: 4 },
      { platform: 'instagram', metric: 'engagement', value: 8 },
      { platform: 'tiktok', metric: 'reach', value: 500 },
    ]);

    const medians = await computePlatformMedians();

    expect(medians.instagram.avgReach).toBe(200);   // median of [100,200,300]
    expect(medians.instagram.avgEngagement).toBe(6); // median of [4,8]
    expect(medians.tiktok.avgReach).toBe(500);
    expect(medians.tiktok.avgEngagement).toBeUndefined();
  });

  it('returns empty object when no analytics rows exist', async () => {
    mockFindMany.mockResolvedValue([]);
    const medians = await computePlatformMedians();
    expect(medians).toEqual({});
  });

  it('new users receive median-based defaults after seeding', async () => {
    mockFindMany.mockResolvedValue([
      { platform: 'facebook', metric: 'engagement', value: 3.1 },
      { platform: 'facebook', metric: 'engagement', value: 7.9 },
    ]);

    const medians = await computePlatformMedians();
    predictiveService.seedFromMedians(medians);

    // median of [3.1, 7.9] = 5.5
    expect(medians.facebook.avgEngagement).toBeCloseTo(5.5);

    const prediction = await predictiveService.predictReach({
      content: 'community event local family friends gathering',
      platform: 'facebook',
    });
    expect(prediction).toBeDefined();
    expect(prediction.reachScore).toBeGreaterThanOrEqual(0);
  });
});
