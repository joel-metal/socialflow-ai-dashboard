/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SearchService {
    /**
     * Full-text search across posts
     * @returns any Search results
     * @throws ApiError
     */
    public static getSearch({
        q,
        limit = 20,
    }: {
        q: string,
        limit?: number,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/search',
            query: {
                'q': q,
                'limit': limit,
            },
            errors: {
                400: `Missing query parameter`,
            },
        });
    }
}
