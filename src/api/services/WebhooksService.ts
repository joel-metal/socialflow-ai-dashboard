/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebhookDelivery } from '../models/WebhookDelivery';
import type { WebhookSubscription } from '../models/WebhookSubscription';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WebhooksService {
    /**
     * List all webhook subscriptions for the authenticated user
     * @returns WebhookSubscription Array of webhook subscriptions
     * @throws ApiError
     */
    public static getWebhooks(): CancelablePromise<Array<WebhookSubscription>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/webhooks',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create a new webhook subscription
     * @returns WebhookSubscription Webhook created
     * @throws ApiError
     */
    public static postWebhooks({
        requestBody,
    }: {
        requestBody: {
            url: string;
            secret: string;
            events: Array<string>;
        },
    }): CancelablePromise<WebhookSubscription> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/webhooks',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Validation error`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a webhook subscription by ID
     * @returns WebhookSubscription Webhook subscription
     * @throws ApiError
     */
    public static getWebhooks1({
        id,
    }: {
        id: string,
    }): CancelablePromise<WebhookSubscription> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/webhooks/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * Update a webhook subscription
     * @returns any Updated webhook
     * @throws ApiError
     */
    public static patchWebhooks({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: {
            url?: string;
            secret?: string;
            events?: Array<string>;
            isActive?: boolean;
        },
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/webhooks/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a webhook subscription
     * @returns void
     * @throws ApiError
     */
    public static deleteWebhooks({
        id,
    }: {
        id: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/webhooks/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * Send a test event to a webhook
     * @returns any Test delivery result
     * @throws ApiError
     */
    public static postWebhooksTest({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: {
            eventType: string;
        },
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/webhooks/{id}/test',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * List delivery attempts for a webhook
     * @returns WebhookDelivery Array of delivery records
     * @throws ApiError
     */
    public static getWebhooksDeliveries({
        id,
    }: {
        id: string,
    }): CancelablePromise<Array<WebhookDelivery>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/webhooks/{id}/deliveries',
            path: {
                'id': id,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
    /**
     * Replay a specific webhook delivery
     * @returns any Replay result
     * @throws ApiError
     */
    public static postWebhooksDeliveriesReplay({
        id,
        deliveryId,
    }: {
        id: string,
        deliveryId: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/webhooks/{id}/deliveries/{deliveryId}/replay',
            path: {
                'id': id,
                'deliveryId': deliveryId,
            },
            errors: {
                404: `Not found`,
            },
        });
    }
}
