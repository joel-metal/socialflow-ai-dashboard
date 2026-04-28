/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TtsService {
    /**
     * Create a text-to-speech job
     * @returns any TTS job created
     * @throws ApiError
     */
    public static postTtsJobs({
        requestBody,
    }: {
        requestBody: {
            segments: Array<Record<string, any>>;
            provider?: 'elevenlabs' | 'google';
        },
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/tts/jobs',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
            },
        });
    }
    /**
     * List all TTS jobs
     * @returns any Array of TTS jobs
     * @throws ApiError
     */
    public static getTtsJobs(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tts/jobs',
        });
    }
    /**
     * Get TTS job status
     * @returns any TTS job
     * @throws ApiError
     */
    public static getTtsJobs1({
        jobId,
    }: {
        jobId: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tts/jobs/{jobId}',
            path: {
                'jobId': jobId,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * Cancel a TTS job
     * @returns any Job cancelled
     * @throws ApiError
     */
    public static deleteTtsJobs({
        jobId,
    }: {
        jobId: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/tts/jobs/{jobId}',
            path: {
                'jobId': jobId,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * List available TTS voices
     * @returns any Array of voices
     * @throws ApiError
     */
    public static getTtsVoices({
        provider,
    }: {
        provider?: 'elevenlabs' | 'google',
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tts/voices',
            query: {
                'provider': provider,
            },
        });
    }
}
