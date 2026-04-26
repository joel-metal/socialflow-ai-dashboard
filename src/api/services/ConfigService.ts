// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { ConfigUpdateRequest } from '../models';

export class ConfigService {
  static getConfig(): Promise<{ success?: boolean; configs?: Record<string, unknown> }> {
    return request(OpenAPI, { method: 'GET', url: '/api/config' });
  }

  static refreshConfig(): Promise<unknown> {
    return request(OpenAPI, { method: 'POST', url: '/api/config/refresh' });
  }

  static updateConfig(key: string, body: ConfigUpdateRequest): Promise<unknown> {
    return request(OpenAPI, { method: 'PUT', url: '/api/config/{key}', path: { key }, body });
  }
}
