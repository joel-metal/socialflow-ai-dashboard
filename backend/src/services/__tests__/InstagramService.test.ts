/**
 * InstagramService — carousel aspect ratio validation tests.
 *
 * Covers:
 *  - inferAspectRatio helper
 *  - resolveItemAspectRatio helper
 *  - Per-item validation (item count, missing ratio info)
 *  - Cross-item consistency check (the core fix)
 *  - Happy path with uniform ratios
 */

jest.mock('opossum', () => jest.fn().mockImplementation(() => ({
  fire: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  on: jest.fn(), open: jest.fn(), close: jest.fn(),
  clearCache: jest.fn(), shutdown: jest.fn(),
  opened: false, halfOpen: false,
  stats: { failures: 0, successes: 0, rejects: 0, fires: 0, fallbacks: 0, latencies: {} },
  latencyMean: 0,
})), { virtual: true });

jest.mock('../../queues/SocialWorker', () => ({
  createSocialWorker: jest.fn().mockReturnValue({
    run: jest.fn().mockResolvedValue({ result: { id: 'mock-id' }, error: null, attempts: 1 }),
  }),
}));

jest.mock('../../lib/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../CircuitBreakerService', () => ({
  circuitBreakerService: {
    execute: jest.fn().mockImplementation(
      (_name: string, fn: () => Promise<unknown>) => fn()
    ),
    getStats: jest.fn().mockReturnValue({ name: 'mock', state: 'closed' }),
  },
}));

import {
  InstagramService,
  inferAspectRatio,
  resolveItemAspectRatio,
  CarouselItem,
} from '../InstagramService';

// ── inferAspectRatio ──────────────────────────────────────────────────────────

describe('inferAspectRatio()', () => {
  it('returns SQUARE for 1:1', () => expect(inferAspectRatio(1080, 1080)).toBe('SQUARE'));
  it('returns SQUARE for ratio within [0.9, 1.1]', () => expect(inferAspectRatio(1000, 1000)).toBe('SQUARE'));
  it('returns LANDSCAPE for 16:9', () => expect(inferAspectRatio(1920, 1080)).toBe('LANDSCAPE'));
  it('returns PORTRAIT for 4:5', () => expect(inferAspectRatio(1080, 1350)).toBe('PORTRAIT'));
  it('throws when height is zero', () => expect(() => inferAspectRatio(100, 0)).toThrow('Height must be greater than zero'));
});

// ── resolveItemAspectRatio ────────────────────────────────────────────────────

describe('resolveItemAspectRatio()', () => {
  it('uses explicit aspectRatio when provided', () => {
    const item: CarouselItem = { url: 'https://example.com/img.jpg', aspectRatio: 'LANDSCAPE' };
    expect(resolveItemAspectRatio(item)).toBe('LANDSCAPE');
  });

  it('infers from width/height when aspectRatio is omitted', () => {
    const item: CarouselItem = { url: 'https://example.com/img.jpg', width: 1080, height: 1080 };
    expect(resolveItemAspectRatio(item)).toBe('SQUARE');
  });

  it('throws when neither aspectRatio nor dimensions are provided', () => {
    const item: CarouselItem = { url: 'https://example.com/img.jpg' };
    expect(() => resolveItemAspectRatio(item)).toThrow('no aspectRatio and no width/height');
  });
});

// ── createCarouselContainer — validation ─────────────────────────────────────

function makeService(): InstagramService {
  process.env.INSTAGRAM_ACCESS_TOKEN = 'real-token';
  process.env.INSTAGRAM_ACCOUNT_ID = 'acc-123';
  return new InstagramService();
}

function item(aspectRatio: CarouselItem['aspectRatio'], url = 'https://example.com/img.jpg'): CarouselItem {
  return { url, aspectRatio };
}

describe('createCarouselContainer() — per-item validation', () => {
  afterEach(() => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCOUNT_ID;
  });

  it('throws when not configured', async () => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCOUNT_ID;
    const svc = new InstagramService();
    await expect(svc.createCarouselContainer([item('SQUARE'), item('SQUARE')])).rejects.toThrow('Instagram API not configured');
  });

  it('throws when fewer than 2 items', async () => {
    const svc = makeService();
    await expect(svc.createCarouselContainer([item('SQUARE')])).rejects.toThrow('between 2 and 10 items');
  });

  it('throws when more than 10 items', async () => {
    const svc = makeService();
    const items = Array.from({ length: 11 }, () => item('SQUARE'));
    await expect(svc.createCarouselContainer(items)).rejects.toThrow('between 2 and 10 items');
  });

  it('throws when an item has no aspect ratio info', async () => {
    const svc = makeService();
    const items: CarouselItem[] = [
      { url: 'https://example.com/a.jpg', aspectRatio: 'SQUARE' },
      { url: 'https://example.com/b.jpg' }, // no ratio, no dimensions
    ];
    await expect(svc.createCarouselContainer(items)).rejects.toThrow('index 1');
  });
});

// ── createCarouselContainer — cross-item consistency (core fix) ───────────────

describe('createCarouselContainer() — cross-item aspect ratio consistency', () => {
  beforeEach(() => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'real-token';
    process.env.INSTAGRAM_ACCOUNT_ID = 'acc-123';
  });

  afterEach(() => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCOUNT_ID;
  });

  it('rejects SQUARE + LANDSCAPE mix', async () => {
    const svc = new InstagramService();
    await expect(
      svc.createCarouselContainer([item('SQUARE'), item('LANDSCAPE')])
    ).rejects.toThrow('mixed aspect ratios');
  });

  it('rejects PORTRAIT + SQUARE mix', async () => {
    const svc = new InstagramService();
    await expect(
      svc.createCarouselContainer([item('PORTRAIT'), item('SQUARE')])
    ).rejects.toThrow('mixed aspect ratios');
  });

  it('rejects LANDSCAPE + PORTRAIT mix', async () => {
    const svc = new InstagramService();
    await expect(
      svc.createCarouselContainer([item('LANDSCAPE'), item('PORTRAIT')])
    ).rejects.toThrow('mixed aspect ratios');
  });

  it('identifies the exact mismatching item index in the error', async () => {
    const svc = new InstagramService();
    const items = [item('SQUARE'), item('SQUARE'), item('LANDSCAPE')];
    await expect(svc.createCarouselContainer(items)).rejects.toThrow('item 2 is LANDSCAPE');
  });

  it('rejects a mix detected via inferred dimensions', async () => {
    const svc = new InstagramService();
    const items: CarouselItem[] = [
      { url: 'https://example.com/a.jpg', width: 1080, height: 1080 }, // SQUARE
      { url: 'https://example.com/b.jpg', width: 1920, height: 1080 }, // LANDSCAPE
    ];
    await expect(svc.createCarouselContainer(items)).rejects.toThrow('mixed aspect ratios');
  });

  it('accepts all SQUARE items', async () => {
    const svc = new InstagramService();
    const items = [item('SQUARE'), item('SQUARE'), item('SQUARE')];
    await expect(svc.createCarouselContainer(items)).resolves.toBeDefined();
  });

  it('accepts all PORTRAIT items', async () => {
    const svc = new InstagramService();
    const items = [item('PORTRAIT'), item('PORTRAIT')];
    await expect(svc.createCarouselContainer(items)).resolves.toBeDefined();
  });

  it('accepts all LANDSCAPE items', async () => {
    const svc = new InstagramService();
    const items = [item('LANDSCAPE'), item('LANDSCAPE'), item('LANDSCAPE')];
    await expect(svc.createCarouselContainer(items)).resolves.toBeDefined();
  });

  it('accepts items with consistent ratios inferred from dimensions', async () => {
    const svc = new InstagramService();
    const items: CarouselItem[] = [
      { url: 'https://example.com/a.jpg', width: 1080, height: 1080 },
      { url: 'https://example.com/b.jpg', width: 500, height: 500 },
    ];
    await expect(svc.createCarouselContainer(items)).resolves.toBeDefined();
  });
});

// ── isConfigured ──────────────────────────────────────────────────────────────

describe('isConfigured()', () => {
  it('returns false when INSTAGRAM_ACCESS_TOKEN is missing', () => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCOUNT_ID;
    expect(new InstagramService().isConfigured()).toBe(false);
  });

  it('returns false when INSTAGRAM_ACCOUNT_ID is missing', () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'real-token';
    delete process.env.INSTAGRAM_ACCOUNT_ID;
    expect(new InstagramService().isConfigured()).toBe(false);
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  it('returns true when both are set', () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'real-token';
    process.env.INSTAGRAM_ACCOUNT_ID = 'acc-123';
    expect(new InstagramService().isConfigured()).toBe(true);
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCOUNT_ID;
  });
});
