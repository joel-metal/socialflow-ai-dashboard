/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AnalyticsService {
    /**
     * Get aggregated analytics
     * @returns any Analytics filters acknowledged
     * @throws ApiError
     */
    public static getAnalytics({
        platform,
        from,
        to,
    }: {
        platform?: 'twitter' | 'linkedin' | 'instagram' | 'tiktok',
        /**
         * Start of date range (Unix ms)
         */
        from?: number,
        /**
         * End of date range (Unix ms)
         */
        to?: number,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/analytics',
            query: {
                'platform': platform,
                'from': from,
                'to': to,
            },
            errors: {
                400: `Invalid query parameters`,
            },
        });
    }
}
