import CircuitBreaker from 'opossum';
import {
  CircuitBreakerConfig,
  CIRCUIT_CONFIGS,
  FALLBACK_STRATEGIES,
} from '../config/circuitBreaker.config';
import { createLogger } from '../lib/logger';

const logger = createLogger('circuit-breaker');

/**
 * Circuit Breaker State
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit Breaker Statistics
 */
export interface CircuitStats {
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

/**
 * Circuit Breaker Service
 *
 * Wraps external API calls with circuit breaker pattern to prevent
 * cascading failures when external services are down.
 *
 * Features:
 * - Automatic failure detection and circuit opening
 * - Configurable thresholds per service type
 * - Fallback strategies
 * - Real-time monitoring and statistics
 * - Health check integration
 */
class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private fallbackHandlers: Map<string, (...args: unknown[]) => unknown> = new Map();

  /**
   * Create or get a circuit breaker for a service
   */
  public getBreaker(
    serviceName: keyof typeof CIRCUIT_CONFIGS,
    customConfig?: Partial<CircuitBreakerConfig>,
  ): CircuitBreaker {
    const existingBreaker = this.breakers.get(serviceName);
    if (existingBreaker) {
      return existingBreaker;
    }

    const config = {
      ...CIRCUIT_CONFIGS[serviceName],
      ...customConfig,
    };

    const breaker = new CircuitBreaker(
      async (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        return await fn(...args);
      },
      {
        timeout: config.timeout,
        errorThresholdPercentage: config.errorThresholdPercentage,
        resetTimeout: config.resetTimeout,
        rollingCountTimeout: config.rollingCountTimeout,
        rollingCountBuckets: config.rollingCountBuckets,
        volumeThreshold: config.volumeThreshold,
        name: config.name,
      },
    );

    // Setup event listeners for monitoring
    this.setupEventListeners(breaker, serviceName);

    this.breakers.set(serviceName, breaker);
    return breaker;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(
    serviceName: keyof typeof CIRCUIT_CONFIGS,
    fn: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    const breaker = this.getBreaker(serviceName);

    try {
      return await breaker.fire(fn);
    } catch (error) {
      // Circuit is open or function failed
      if (fallback) {
        logger.warn(`Circuit breaker fallback triggered for ${serviceName}`);
        return await fallback();
      }

      // Check if we have a registered fallback handler
      const registeredFallback = this.fallbackHandlers.get(serviceName);
      if (registeredFallback) {
        return await registeredFallback(error);
      }

      // Use default fallback strategy
      const strategy = FALLBACK_STRATEGIES[serviceName];
      if (strategy?.enabled) {
        throw new CircuitBreakerError(serviceName, strategy.message, error);
      }

      throw error;
    }
  }

  /**
   * Register a fallback handler for a service
   */
  public registerFallback(
    serviceName: keyof typeof CIRCUIT_CONFIGS,
    handler: (...args: unknown[]) => unknown,
  ): void {
    this.fallbackHandlers.set(serviceName, handler);
  }

  /**
   * Get circuit breaker statistics
   */
  public getStats(serviceName?: keyof typeof CIRCUIT_CONFIGS): CircuitStats | CircuitStats[] {
    if (serviceName) {
      const breaker = this.breakers.get(serviceName);
      if (!breaker) {
        throw new Error(`Circuit breaker not found: ${serviceName}`);
      }
      return this.extractStats(breaker, serviceName);
    }

    // Return all stats
    const allStats: CircuitStats[] = [];
    this.breakers.forEach((breaker, name) => {
      allStats.push(this.extractStats(breaker, name));
    });
    return allStats;
  }

  /**
   * Extract statistics from a circuit breaker
   */
  private extractStats(breaker: CircuitBreaker, name: string): CircuitStats {
    const stats = breaker.stats;
    const latency = breaker.latencyMean
      ? {
          mean: breaker.latencyMean || 0,
          median: stats.latencies?.median || 0,
          p95: stats.latencies?.p95 || 0,
          p99: stats.latencies?.p99 || 0,
        }
      : {
          mean: 0,
          median: 0,
          p95: 0,
          p99: 0,
        };

    return {
      name,
      state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
      failures: stats.failures || 0,
      successes: stats.successes || 0,
      rejects: stats.rejects || 0,
      fires: stats.fires || 0,
      fallbacks: stats.fallbacks || 0,
      latency,
    };
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners(breaker: CircuitBreaker, serviceName: string): void {
    breaker.on('open', () => {
      logger.warn(`Circuit breaker OPENED for ${serviceName}`);
    });

    breaker.on('halfOpen', () => {
      logger.info(`Circuit breaker HALF-OPEN for ${serviceName}`);
    });

    breaker.on('close', () => {
      logger.info(`Circuit breaker CLOSED for ${serviceName}`);
    });

    breaker.on('failure', (error) => {
      logger.error(`Circuit breaker failure for ${serviceName}`, { message: error.message });
    });

    breaker.on('success', () => {
      logger.info(`Circuit breaker success for ${serviceName}`);
    });

    breaker.on('timeout', () => {
      logger.warn(`Circuit breaker timeout for ${serviceName}`);
    });

    breaker.on('reject', () => {
      logger.warn(`Circuit breaker rejected request for ${serviceName} (circuit is open)`);
    });

    breaker.on('fallback', () => {
      logger.info(`Circuit breaker fallback triggered for ${serviceName}`);
    });
  }

  /**
   * Manually open a circuit breaker
   */
  public open(serviceName: keyof typeof CIRCUIT_CONFIGS): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.open();
    }
  }

  /**
   * Manually close a circuit breaker
   */
  public close(serviceName: keyof typeof CIRCUIT_CONFIGS): void {
    const breaker = this.breakers.get(serviceName);
    if (breaker) {
      breaker.close();
    }
  }

  /**
   * Check if a circuit is open
   */
  public isOpen(serviceName: keyof typeof CIRCUIT_CONFIGS): boolean {
    const breaker = this.breakers.get(serviceName);
    return breaker ? breaker.opened : false;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    this.breakers.forEach((breaker) => {
      breaker.close();
      breaker.clearCache();
    });
  }

  /**
   * Shutdown all circuit breakers
   */
  public shutdown(): void {
    this.breakers.forEach((breaker) => {
      breaker.shutdown();
    });
    this.breakers.clear();
    this.fallbackHandlers.clear();
  }
}

/**
 * Custom error for circuit breaker failures
 */
export class CircuitBreakerError extends Error {
  constructor(
    public serviceName: string,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Singleton instance
export const circuitBreakerService = new CircuitBreakerService();
