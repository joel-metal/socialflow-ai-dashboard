// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookDelivery,
  WebhookEventType,
  WebhookSubscription,
} from '../models';

export class WebhooksService {
  static listWebhooks(): Promise<WebhookSubscription[]> {
    return request(OpenAPI, { method: 'GET', url: '/api/webhooks' });
  }

  static createWebhook(body: CreateWebhookRequest): Promise<WebhookSubscription & { secret?: string }> {
    return request(OpenAPI, { method: 'POST', url: '/api/webhooks', body });
  }

  static getWebhook(id: string): Promise<WebhookSubscription> {
    return request(OpenAPI, { method: 'GET', url: '/api/webhooks/{id}', path: { id } });
  }

  static updateWebhook(id: string, body: UpdateWebhookRequest): Promise<WebhookSubscription> {
    return request(OpenAPI, { method: 'PATCH', url: '/api/webhooks/{id}', path: { id }, body });
  }

  static deleteWebhook(id: string): Promise<void> {
    return request(OpenAPI, { method: 'DELETE', url: '/api/webhooks/{id}', path: { id } });
  }

  static testWebhook(id: string, body: { eventType: WebhookEventType }): Promise<{ message?: string }> {
    return request(OpenAPI, { method: 'POST', url: '/api/webhooks/{id}/test', path: { id }, body });
  }

  static listDeliveries(id: string): Promise<WebhookDelivery[]> {
    return request(OpenAPI, { method: 'GET', url: '/api/webhooks/{id}/deliveries', path: { id } });
  }

  static replayDelivery(id: string, deliveryId: string): Promise<{ message?: string }> {
    return request(OpenAPI, {
      method: 'POST',
      url: '/api/webhooks/{id}/deliveries/{deliveryId}/replay',
      path: { id, deliveryId },
    });
  }
}
