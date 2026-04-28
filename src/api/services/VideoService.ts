/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoJob } from '../models/VideoJob';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class VideoService {
    /**
     * Create a video transcoding job
     * @returns VideoJob Job created
     * @throws ApiError
     */
    public static postVideoTranscode({
        requestBody,
    }: {
        requestBody: {
            inputPath: string;
            options?: Record<string, any>;
        },
    }): CancelablePromise<VideoJob> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/video/transcode',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
            },
        });
    }
    /**
     * Get video transcoding job status
     * @returns VideoJob Job status
     * @throws ApiError
     */
    public static getVideoJobs({
        jobId,
    }: {
        jobId: string,
    }): CancelablePromise<VideoJob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/video/jobs/{jobId}',
            path: {
                'jobId': jobId,
            },
            errors: {
                404: `Job not found`,
            },
        });
    }
}
