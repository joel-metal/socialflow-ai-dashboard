import { circuitBreakerService } from './CircuitBreakerService';
import { createSocialWorker } from '../queues/SocialWorker';

const tiktokWorker = createSocialWorker({ maxAttempts: 5, fallbackBackoffMs: 1000 });

export interface TikTokVideo {
  id: string;
  title: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export interface TikTokUser {
  open_id: string;
  union_id: string;
  display_name: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
}

/**
 * TikTokService - Wrapper for TikTok API with circuit breaker + smart retry protection.
 */
export class TikTokService {
  private readonly API_BASE = 'https://open.tiktokapis.com/v2';
  private readonly accessToken: string;

  constructor() {
    this.accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  }

  public isConfigured(): boolean {
    return !!this.accessToken && this.accessToken !== 'your_tiktok_access_token';
  }

  /** Fetch the authenticated user's info */
  public async getUserInfo(): Promise<TikTokUser | null> {
    if (!this.isConfigured()) throw new Error('TikTok API not configured.');

    return circuitBreakerService.execute(
      'tiktok',
      async () => {
        const { result, error } = await tiktokWorker.run<TikTokUser | null>({
          id: 'tiktok-getUserInfo',
          execute: () =>
            fetch(`${this.API_BASE}/user/info/?fields=open_id,union_id,display_name,avatar_url,follower_count,following_count`, {
              headers: { Authorization: `Bearer ${this.accessToken}` },
            }),
          transform: async (res) => {
            const data = await res.json() as { data?: { user?: TikTokUser } };
            return data.data?.user ?? null;
          },
        });
        if (error) throw error;
        return result!;
      },
      async () => {
        console.warn('TikTok circuit breaker open, returning null user');
        return null;
      }
    );
  }

  /** Fetch the authenticated user's video list */
  public async listVideos(maxCount: number = 10): Promise<TikTokVideo[]> {
    if (!this.isConfigured()) throw new Error('TikTok API not configured.');

    return circuitBreakerService.execute(
      'tiktok',
      async () => {
        const { result, error } = await tiktokWorker.run<TikTokVideo[]>({
          id: 'tiktok-listVideos',
          execute: () =>
            fetch(`${this.API_BASE}/video/list/?fields=id,title,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ max_count: maxCount }),
            }),
          transform: async (res) => {
            const data = await res.json() as { data?: { videos?: TikTokVideo[] } };
            return data.data?.videos ?? [];
          },
        });
        if (error) throw error;
        return result!;
      },
      async () => {
        console.warn('TikTok circuit breaker open, returning empty video list');
        return [];
      }
    );
  }

  /** Health check */
  public async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const user = await this.getUserInfo();
      return user !== null;
    } catch {
      return false;
    }
  }

  public getCircuitStatus() {
    return circuitBreakerService.getStats('tiktok');
  }
}

export const tiktokService = new TikTokService();
