import { circuitBreakerService } from './CircuitBreakerService';
import { createLogger } from '../lib/logger';

const logger = createLogger('linkedin-service');

const API_BASE = 'https://api.linkedin.com/v2';
const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

export interface LinkedInTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  vanityName?: string;
}

export interface LinkedInShareRequest {
  /** URN of the author — either a person URN or organization URN */
  authorUrn: string;
  text: string;
  /** Optional URL to attach as a link share */
  url?: string;
  title?: string;
  description?: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export interface LinkedInShareResult {
  id: string;
  activity: string;
}

export interface LinkedInPostStats {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  impressionCount: number;
  clickCount: number;
}

class LinkedInService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID || '';
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
    this.redirectUri =
      process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3001/api/v1/linkedin/callback';
  }

  public isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  /**
   * Step 1 — Build the LinkedIn OAuth 2.0 Three-Legged authorization URL.
   * Scopes: r_liteprofile, r_emailaddress, w_member_social
   */
  public getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'r_liteprofile r_emailaddress w_member_social',
    });
    return `${AUTH_URL}?${params}`;
  }

  /**
   * Step 2 — Exchange authorization code for access token.
   */
  public async exchangeCode(code: string): Promise<LinkedInTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`LinkedIn token exchange failed: ${JSON.stringify(err)}`);
    }

    const data = (await response.json()) as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 5183944) * 1000,
    };
  }

  /**
   * Get the authenticated member's basic profile.
   * Returns a person URN usable as `authorUrn` in shareContent.
   */
  public async getProfile(accessToken: string): Promise<LinkedInProfile> {
    return circuitBreakerService.execute(
      'linkedin' as any,
      async () => {
        const response = await fetch(
          `${API_BASE}/me?projection=(id,localizedFirstName,localizedLastName,vanityName)`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!response.ok) {
          throw new Error(`LinkedIn profile fetch failed: ${response.status}`);
        }

        return (await response.json()) as LinkedInProfile;
      },
      async () => {
        throw new Error('LinkedIn API temporarily unavailable');
      },
    );
  }

  /**
   * Share a text post (UGC Post) on behalf of a member or organization.
   * `authorUrn` must be a URN, e.g. `urn:li:person:{id}` or `urn:li:organization:{id}`.
   */
  public async shareContent(
    accessToken: string,
    request: LinkedInShareRequest,
  ): Promise<LinkedInShareResult> {
    return circuitBreakerService.execute(
      'linkedin' as any,
      async () => {
        const body: Record<string, any> = {
          author: request.authorUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: request.text },
              shareMediaCategory: request.url ? 'ARTICLE' : 'NONE',
              ...(request.url && {
                media: [
                  {
                    status: 'READY',
                    originalUrl: request.url,
                    title: { text: request.title || '' },
                    description: { text: request.description || '' },
                  },
                ],
              }),
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility':
              request.visibility ?? 'PUBLIC',
          },
        };

        const response = await fetch(`${API_BASE}/ugcPosts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(`LinkedIn share failed: ${JSON.stringify(err)}`);
        }

        // LinkedIn returns the post URN in the X-RestLi-Id header
        const postUrn = response.headers.get('x-restli-id') || '';
        return { id: postUrn, activity: postUrn };
      },
      async () => {
        throw new Error('LinkedIn API temporarily unavailable. Post has been queued for retry.');
      },
    );
  }

  /**
   * Retrieve engagement statistics for a UGC post.
   * `postUrn` is the URN returned by shareContent (URL-encoded for the query).
   */
  public async getPostStats(
    accessToken: string,
    postUrn: string,
  ): Promise<LinkedInPostStats> {
    return circuitBreakerService.execute(
      'linkedin' as any,
      async () => {
        const encoded = encodeURIComponent(postUrn);
        const response = await fetch(
          `${API_BASE}/socialActions/${encoded}?projection=(likesSummary,commentsSummary,shareStatistics)`,
          { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } },
        );

        if (!response.ok) {
          throw new Error(`LinkedIn stats fetch failed: ${response.status}`);
        }

        const data = (await response.json()) as any;
        return {
          likeCount: data.likesSummary?.totalLikes ?? 0,
          commentCount: data.commentsSummary?.totalFirstLevelComments ?? 0,
          shareCount: data.shareStatistics?.shareCount ?? 0,
          impressionCount: data.shareStatistics?.impressionCount ?? 0,
          clickCount: data.shareStatistics?.clickCount ?? 0,
        };
      },
      async () => {
        logger.warn('LinkedIn circuit breaker open, returning empty stats');
        return { likeCount: 0, commentCount: 0, shareCount: 0, impressionCount: 0, clickCount: 0 };
      },
    );
  }

  public async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const response = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer __probe__` },
      });
      // 401 means the API is reachable; any network error means it's not
      return response.status !== 0;
    } catch {
      return false;
    }
  }

  public getCircuitStatus() {
    return circuitBreakerService.getStats('linkedin' as any);
  }
}

export const linkedInService = new LinkedInService();
