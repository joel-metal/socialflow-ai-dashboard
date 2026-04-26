// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { CircuitBreakerStats } from '../models';

export class CircuitBreakerService {
  static getCircuitBreakerStatus(): Promise<{ success?: boolean; circuitBreakers?: Record<string, CircuitBreakerStats>; timestamp?: string }> {
    return request(OpenAPI, { method: 'GET', url: '/api/circuit-breaker/status' });
  }

  static getCircuitBreakerStatusByService(service: string): Promise<{ success?: boolean; circuitBreaker?: CircuitBreakerStats; timestamp?: string }> {
    return request(OpenAPI, { method: 'GET', url: '/api/circuit-breaker/status/{service}', path: { service } });
  }

  static resetCircuitBreakers(): Promise<unknown> {
    return request(OpenAPI, { method: 'POST', url: '/api/circuit-breaker/reset' });
  }

  static openCircuitBreaker(service: string): Promise<unknown> {
    return request(OpenAPI, { method: 'POST', url: '/api/circuit-breaker/{service}/open', path: { service } });
  }

  static closeCircuitBreaker(service: string): Promise<unknown> {
    return request(OpenAPI, { method: 'POST', url: '/api/circuit-breaker/{service}/close', path: { service } });
  }

  static getCircuitBreakerHealth(): Promise<unknown> {
    return request(OpenAPI, { method: 'GET', url: '/api/circuit-breaker/health' });
  }
}
