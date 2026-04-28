/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthTokens } from '../models/AuthTokens';
import type { ChangePasswordRequest } from '../models/ChangePasswordRequest';
import type { Credentials } from '../models/Credentials';
import type { RefreshTokenRequest } from '../models/RefreshTokenRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Register a new user
     * @returns AuthTokens User created — returns JWT tokens
     * @throws ApiError
     */
    public static postAuthRegister({
        requestBody,
    }: {
        requestBody: Credentials,
    }): CancelablePromise<AuthTokens> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
                409: `Email already in use`,
            },
        });
    }
    /**
     * Authenticate and obtain JWT tokens
     * @returns AuthTokens Successful login
     * @throws ApiError
     */
    public static postAuthLogin({
        requestBody,
    }: {
        requestBody: Credentials,
    }): CancelablePromise<AuthTokens> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
                401: `Invalid credentials`,
            },
        });
    }
    /**
     * Refresh access token using a refresh token
     * @returns AuthTokens New token pair issued
     * @throws ApiError
     */
    public static postAuthRefresh({
        requestBody,
    }: {
        requestBody: RefreshTokenRequest,
    }): CancelablePromise<AuthTokens> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/refresh',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Invalid or expired refresh token`,
            },
        });
    }
    /**
     * Revoke a refresh token
     * @returns void
     * @throws ApiError
     */
    public static postAuthLogout({
        requestBody,
    }: {
        requestBody: RefreshTokenRequest,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/logout',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
            },
        });
    }
    /**
     * Change the authenticated user's password
     * @returns any Password changed successfully
     * @throws ApiError
     */
    public static postAuthChangePassword({
        requestBody,
    }: {
        requestBody: ChangePasswordRequest,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/change-password',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error or wrong current password`,
                401: `Unauthorized`,
            },
        });
    }
}
