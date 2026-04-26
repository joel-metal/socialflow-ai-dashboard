// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { SystemStatus } from '../models';

export class StatusService {
  static getSystemStatus(): Promise<SystemStatus> {
    return request(OpenAPI, { method: 'GET', url: '/api/status' });
  }

  static getHealth(): Promise<{ status?: string; timestamp?: string }> {
    return request(OpenAPI, { method: 'GET', url: '/health' });
  }
}
