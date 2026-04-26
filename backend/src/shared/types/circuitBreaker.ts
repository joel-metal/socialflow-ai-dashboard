/**
 * Circuit Breaker Type Definitions
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  rejects: number;
  fires: number;
  fallbacks: number;
  latency: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
}

export interface CircuitBreakerHealth {
  configured: boolean;
  circuitOpen: boolean;
  lastError?: string;
  lastSuccess?: string;
}

export interface CircuitBreakerStatusResponse {
  success: boolean;
  circuitBreakers: CircuitBreakerStats[];
  timestamp: string;
}

export interface ServiceHealthResponse {
  success: boolean;
  services: {
    [key: string]: CircuitBreakerHealth;
  };
  timestamp: string;
}
