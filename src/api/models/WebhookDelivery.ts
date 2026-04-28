/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WebhookDelivery = {
    id?: string;
    eventType?: string;
    status?: 'pending' | 'success' | 'failed';
    attempts?: number;
    responseStatus?: number | null;
    errorMessage?: string | null;
    createdAt?: string;
    nextRetryAt?: string | null;
};

