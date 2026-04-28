/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AiService {
    /**
     * Generate a social media caption from an image using AI
     * Accepts a base64-encoded image or public URL and returns an AI-generated caption. Deducts ai:generate credits.
     * @returns any AI-generated caption
     * @throws ApiError
     */
    public static postAiAnalyzeImage({
        requestBody,
    }: {
        requestBody: {
            /**
             * Base64-encoded image data or a public image URL
             */
            imageData: string;
            mimeType?: string;
            /**
             * Optional prompt context to guide caption style/topic
             */
            context?: string;
        },
    }): CancelablePromise<{
        caption?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/ai/analyze-image',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `imageData is required`,
                401: `Unauthorized`,
                402: `Insufficient credits`,
                422: `AI processing error`,
            },
        });
    }
}
