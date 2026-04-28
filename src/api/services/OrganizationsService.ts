/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Organization } from '../models/Organization';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class OrganizationsService {
    /**
     * List organizations for the authenticated user
     * @returns Organization Array of organizations
     * @throws ApiError
     */
    public static getOrganizations(): CancelablePromise<Array<Organization>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/organizations',
        });
    }
    /**
     * Create a new organization
     * @returns Organization Organization created
     * @throws ApiError
     */
    public static postOrganizations({
        requestBody,
    }: {
        requestBody: {
            name: string;
        },
    }): CancelablePromise<Organization> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/organizations',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
            },
        });
    }
}
