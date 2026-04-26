import { circuitBreakerService } from './CircuitBreakerService';
import { createSocialWorker } from '../queues/SocialWorker';
import { createLogger } from '../lib/logger';

const logger = createLogger('InstagramService');
const instagramWorker = createSocialWorker({ maxAttempts: 5, fallbackBackoffMs: 1000 });

// ── Types ────────────────────────────────────────────────────────────────────

export type AspectRatio = 'SQUARE' | 'LANDSCAPE' | 'PORTRAIT';

export interface CarouselItem {
  /** Public URL of the image or video */
  url: string;
  /** Explicit aspect ratio — if omitted it is inferred from width/height */
  aspectRatio?: AspectRatio;
  /** Width in pixels (used for inference when aspectRatio is omitted) */
  width?: number;
  /** Height in pixels (used for inference when aspectRatio is omitted) */
  height?: number;
  isVideo?: boolean;
}

export interface CarouselContainerResult {
  containerId: string;
}

export interface InstagramMediaItem {
  id: string;
  media_type: string;
  media_url?: string;
  timestamp: string;
}

// ── Aspect ratio helpers ─────────────────────────────────────────────────────

/**
 * Infers an AspectRatio from pixel dimensions.
 *
 * Instagram thresholds (Graph API docs):
 *   SQUARE    — ratio within [0.9, 1.1]
 *   LANDSCAPE — ratio > 1.1  (wider than tall)
 *   PORTRAIT  — ratio < 0.9  (taller than wide)
 */
export function inferAspectRatio(width: number, height: number): AspectRatio {
  if (height === 0) throw new Error('Height must be greater than zero');
  const ratio = width / height;
  if (ratio > 1.1) return 'LANDSCAPE';
  if (ratio < 0.9) return 'PORTRAIT';
  return 'SQUARE';
}

/**
 * Resolves the effective AspectRatio for a carousel item.
 * Prefers the explicit `aspectRatio` field; falls back to inference from dimensions.
 * Throws if neither is available.
 */
export function resolveItemAspectRatio(item: CarouselItem): AspectRatio {
  if (item.aspectRatio) return item.aspectRatio;
  if (item.width !== undefined && item.height !== undefined) {
    return inferAspectRatio(item.width, item.height);
  }
  throw new Error(
    `Carousel item "${item.url}" has no aspectRatio and no width/height to infer from`
  );
}

// ── Service ──────────────────────────────────────────────────────────────────

export class InstagramService {
  private readonly API_BASE = 'https://graph.facebook.com/v19.0';
  private readonly accessToken: string;
  private readonly accountId: string;

  constructor() {
    this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
    this.accountId = process.env.INSTAGRAM_ACCOUNT_ID || '';
  }

  public isConfigured(): boolean {
    return (
      !!this.accessToken &&
      this.accessToken !== 'your_instagram_access_token' &&
      !!this.accountId
    );
  }

  /**
   * Creates an Instagram carousel container after validating that:
   *  1. There are between 2 and 10 items (Instagram limit).
   *  2. Each item has a resolvable aspect ratio.
   *  3. All items share the same aspect ratio (cross-item consistency).
   */
  public async createCarouselContainer(
    items: CarouselItem[],
    caption?: string
  ): Promise<CarouselContainerResult> {
    if (!this.isConfigured()) {
      throw new Error('Instagram API not configured.');
    }

    // ── Per-item validation ──────────────────────────────────────────────────
    if (items.length < 2 || items.length > 10) {
      throw new Error(
        `Carousel must contain between 2 and 10 items, got ${items.length}`
      );
    }

    const resolvedRatios: AspectRatio[] = items.map((item, index) => {
      try {
        return resolveItemAspectRatio(item);
      } catch (err) {
        throw new Error(`Carousel item at index ${index}: ${(err as Error).message}`);
      }
    });

    // ── Cross-item consistency check ─────────────────────────────────────────
    const firstRatio = resolvedRatios[0];
    const mismatchIndex = resolvedRatios.findIndex((r) => r !== firstRatio);
    if (mismatchIndex !== -1) {
      throw new Error(
        `Carousel items have mixed aspect ratios: item 0 is ${firstRatio} but item ${mismatchIndex} is ${resolvedRatios[mismatchIndex]}. All items must share the same aspect ratio.`
      );
    }

    logger.info('Carousel aspect ratio validation passed', {
      itemCount: items.length,
      aspectRatio: firstRatio,
    });

    // ── Create individual media containers ───────────────────────────────────
    return circuitBreakerService.execute(
      'instagram',
      async () => {
        const childIds: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const params = new URLSearchParams({
            access_token: this.accessToken,
            is_carousel_item: 'true',
            ...(item.isVideo
              ? { video_url: item.url, media_type: 'VIDEO' }
              : { image_url: item.url }),
          });

          const { result, error } = await instagramWorker.run<{ id: string }>({
            id: `instagram-carousel-child-${i}`,
            execute: () =>
              fetch(`${this.API_BASE}/${this.accountId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              }),
            transform: async (res) => {
              const data = await res.json() as { id: string };
              return data;
            },
          });

          if (error) throw error;
          childIds.push(result!.id);
        }

        // ── Create the carousel container ─────────────────────────────────
        const containerParams = new URLSearchParams({
          access_token: this.accessToken,
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          ...(caption ? { caption } : {}),
        });

        const { result, error } = await instagramWorker.run<CarouselContainerResult>({
          id: `instagram-carousel-container-${Date.now()}`,
          execute: () =>
            fetch(`${this.API_BASE}/${this.accountId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: containerParams.toString(),
            }),
          transform: async (res) => {
            const data = await res.json() as { id: string };
            return { containerId: data.id };
          },
        });

        if (error) throw error;
        return result!;
      },
      async () => {
        throw new Error('Instagram API temporarily unavailable.');
      }
    );
  }

  /** Publish a previously created container */
  public async publishContainer(containerId: string): Promise<{ id: string }> {
    if (!this.isConfigured()) throw new Error('Instagram API not configured.');

    return circuitBreakerService.execute(
      'instagram',
      async () => {
        const { result, error } = await instagramWorker.run<{ id: string }>({
          id: `instagram-publish-${containerId}`,
          execute: () =>
            fetch(`${this.API_BASE}/${this.accountId}/media_publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                access_token: this.accessToken,
                creation_id: containerId,
              }).toString(),
            }),
          transform: async (res) => res.json() as Promise<{ id: string }>,
        });
        if (error) throw error;
        return result!;
      },
      async () => { throw new Error('Instagram API temporarily unavailable.'); }
    );
  }

  /** Health check */
  public async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const { result, error } = await instagramWorker.run<boolean>({
        id: 'instagram-health',
        execute: () =>
          fetch(`${this.API_BASE}/${this.accountId}?fields=id&access_token=${this.accessToken}`),
        transform: async (res) => res.ok,
      });
      return !error && result === true;
    } catch {
      return false;
    }
  }

  public getCircuitStatus() {
    return circuitBreakerService.getStats('instagram');
  }
}

export const instagramService = new InstagramService();
