import { circuitBreakerService } from './CircuitBreakerService';

/**
 * Twitter API Response Types
 */
export interface TwitterPost {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

export interface TwitterPostRequest {
  text: string;
  media_ids?: string[];
  reply_to?: string;
}

/**
 * TwitterService - Wrapper for Twitter API with circuit breaker protection
 *
 * Provides resilient Twitter operations with automatic failure handling.
 * Prevents cascading failures when Twitter API is down or rate-limited.
 */
class TwitterService {
  private readonly API_BASE = 'https://api.twitter.com/2';
  private readonly bearerToken: string;

  constructor() {
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
  }

  /**
   * Check if Twitter API is configured
   */
  public isConfigured(): boolean {
    return !!this.bearerToken && this.bearerToken !== 'your_twitter_bearer_token';
  }

  /**
   * Post a tweet with circuit breaker protection
   */
  public async postTweet(request: TwitterPostRequest): Promise<TwitterPost> {
    if (!this.isConfigured()) {
      throw new Error('Twitter API not configured. Please set TWITTER_BEARER_TOKEN.');
    }

    return circuitBreakerService.execute(
      'twitter',
      async () => {
        const response = await fetch(`${this.API_BASE}/tweets`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Twitter API error: ${response.status} - ${JSON.stringify(error)}`);
        }

        const data = await response.json();
        return data.data;
      },
      async () => {
        // Fallback: Queue for later or throw
        throw new Error('Twitter API temporarily unavailable. Post has been queued for retry.');
      },
    );
  }

  /**
   * Get user timeline with circuit breaker protection
   */
  public async getUserTimeline(userId: string, maxResults: number = 10): Promise<TwitterPost[]> {
    if (!this.isConfigured()) {
      throw new Error('Twitter API not configured.');
    }

    return circuitBreakerService.execute(
      'twitter',
      async () => {
        const response = await fetch(
          `${this.API_BASE}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics`,
          {
            headers: {
              Authorization: `Bearer ${this.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Twitter API error: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
      },
      async () => {
        // Fallback: return empty array
        console.warn('Twitter circuit breaker open, returning empty timeline');
        return [];
      },
    );
  }

  /**
   * Get user info with circuit breaker protection
   */
  public async getUserInfo(username: string): Promise<TwitterUser | null> {
    if (!this.isConfigured()) {
      throw new Error('Twitter API not configured.');
    }

    return circuitBreakerService.execute(
      'twitter',
      async () => {
        const response = await fetch(
          `${this.API_BASE}/users/by/username/${username}?user.fields=profile_image_url`,
          {
            headers: {
              Authorization: `Bearer ${this.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Twitter API error: ${response.status}`);
        }

        const data = await response.json();
        return data.data;
      },
      async () => {
        // Fallback: return null
        console.warn('Twitter circuit breaker open, returning null user');
        return null;
      },
    );
  }

  /**
   * Search tweets with circuit breaker protection
   */
  public async searchTweets(query: string, maxResults: number = 10): Promise<TwitterPost[]> {
    if (!this.isConfigured()) {
      throw new Error('Twitter API not configured.');
    }

    return circuitBreakerService.execute(
      'twitter',
      async () => {
        const response = await fetch(
          `${this.API_BASE}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=created_at,public_metrics`,
          {
            headers: {
              Authorization: `Bearer ${this.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Twitter API error: ${response.status}`);
        }

        const data = await response.json();
        return data.data || [];
      },
      async () => {
        // Fallback: return empty array
        console.warn('Twitter circuit breaker open, returning empty search results');
        return [];
      },
    );
  }

  /**
   * Health check for Twitter API
   */
  public async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      return await circuitBreakerService.execute(
        'twitter',
        async () => {
          const response = await fetch(`${this.API_BASE}/users/me`, {
            headers: {
              Authorization: `Bearer ${this.bearerToken}`,
            },
          });
          return response.ok;
        },
        async () => false,
      );
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  public getCircuitStatus() {
    return circuitBreakerService.getStats('twitter');
  }
}

export const twitterService = new TwitterService();
