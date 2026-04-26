// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { AnalyticsFilters } from '../models';

export class AnalyticsService {
  static getAnalytics(query?: {
    platform?: 'twitter' | 'linkedin' | 'instagram' | 'tiktok';
    from?: number;
    to?: number;
  }): Promise<{ message?: string; filters?: AnalyticsFilters }> {
    return request(OpenAPI, { method: 'GET', url: '/api/analytics', query });
  }
}
