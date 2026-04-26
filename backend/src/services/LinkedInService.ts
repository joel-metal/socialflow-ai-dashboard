import { circuitBreakerService } from './CircuitBreakerService';
import { createSocialWorker } from '../queues/SocialWorker';

const linkedinWorker = createSocialWorker({ maxAttempts: 5, fallbackBackoffMs: 1000 });

export interface LinkedInPost {
  id: string;
  author: string;
  text: string;
  created_at: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: string;
}

export interface LinkedInPostRequest {
  text: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

/**
 * LinkedInService - Wrapper for LinkedIn API with circuit breaker + smart retry protection.
 */
export class LinkedInService {
  private readonly API_BASE = 'https://api.linkedin.com/v2';
  private readonly accessToken: string;

  constructor() {
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN || '';
  }

  public isConfigured(): boolean {
    return !!this.accessToken && this.accessToken !== 'your_linkedin_access_token';
  }

  /** Fetch the authenticated member's profile */
  public async getProfile(): Promise<LinkedInProfile | null> {
    if (!this.isConfigured()) throw new Error('LinkedIn API not configured.');

    return circuitBreakerService.execute(
      'linkedin',
      async () => {
        const { result, error } = await linkedinWorker.run<LinkedInProfile | null>({
          id: 'linkedin-getProfile',
          execute: () =>
            fetch(`${this.API_BASE}/me`, {
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            }),
          transform: async (res) => {
            const data = await res.json() as LinkedInProfile | null;
            return data ?? null;
          },
        });
        if (error) throw error;
        return result!;
      },
      async () => {
        console.warn('LinkedIn circuit breaker open, returning null profile');
        return null;
      }
    );
  }

  /** Create a post (UGC share) */
  public async createPost(request: LinkedInPostRequest): Promise<LinkedInPost> {
    if (!this.isConfigured()) throw new Error('LinkedIn API not configured.');

    return circuitBreakerService.execute(
      'linkedin',
      async () => {
        const profile = await this.getProfile();
        if (!profile) throw new Error('Could not resolve LinkedIn member URN');

        const body = {
          author: `urn:li:person:${profile.id}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: request.text },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': request.visibility ?? 'PUBLIC',
          },
        };

        const { result, error } = await linkedinWorker.run<LinkedInPost>({
          id: `linkedin-createPost-${Date.now()}`,
          execute: () =>
            fetch(`${this.API_BASE}/ugcPosts`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0',
              },
              body: JSON.stringify(body),
            }),
          transform: async (res) => {
            const data = await res.json() as { id: string };
            return { id: data.id, author: body.author, text: request.text, created_at: Date.now() };
          },
        });
        if (error) throw error;
        return result!;
      },
      async () => {
        throw new Error('LinkedIn API temporarily unavailable.');
      }
    );
  }

  /** Health check */
  public async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const profile = await this.getProfile();
      return profile !== null;
    } catch {
      return false;
    }
  }

  public getCircuitStatus() {
    return circuitBreakerService.getStats('linkedin');
  }
}

export const linkedinService = new LinkedInService();
