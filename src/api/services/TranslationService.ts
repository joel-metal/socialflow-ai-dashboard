/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TranslationService {
    /**
     * Translate text into one or more target languages
     * @returns any Translation results
     * @throws ApiError
     */
    public static postTranslationTranslate({
        requestBody,
    }: {
        requestBody: {
            text: string;
            sourceLanguage?: string;
            targetLanguages: Array<string>;
            preserveFormatting?: boolean;
            preserveHashtags?: boolean;
            preserveMentions?: boolean;
            preserveUrls?: boolean;
            preserveEmojis?: boolean;
        },
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/translation/translate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
                503: `No translation provider available`,
            },
        });
    }
    /**
     * List supported languages
     * @returns any Array of supported languages
     * @throws ApiError
     */
    public static getTranslationLanguages(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/translation/languages',
        });
    }
}
