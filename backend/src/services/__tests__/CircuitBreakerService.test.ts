import { circuitBreakerService, CircuitStats } from '../CircuitBreakerService';

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    // Reset all breakers before each test
    circuitBreakerService.resetAll();
  });

  afterAll(() => {
    // Cleanup
    circuitBreakerService.shutdown();
  });

  describe('Basic Circuit Breaker Functionality', () => {
    it('should execute successful function', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await circuitBreakerService.execute('ai', mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use fallback on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('API Error'));
      const fallback = jest.fn().mockReturnValue('fallback-value');

      const result = await circuitBreakerService.execute('ai', mockFn, fallback);

      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should throw error when no fallback provided', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(circuitBreakerService.execute('twitter', mockFn)).rejects.toThrow();
    });
  });

  describe('Circuit State Management', () => {
    it('should open circuit after threshold failures', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('API Error'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Trigger multiple failures to open circuit
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreakerService.execute('twitter', mockFn, fallback);
        } catch (_error) {
          // Expected
        }
      }

      const isOpen = circuitBreakerService.isOpen('twitter');
      expect(isOpen).toBe(true);
    });

    it('should manually open circuit', () => {
      circuitBreakerService.open('ai');
      expect(circuitBreakerService.isOpen('ai')).toBe(true);
    });

    it('should manually close circuit', () => {
      circuitBreakerService.open('ai');
      circuitBreakerService.close('ai');
      expect(circuitBreakerService.isOpen('ai')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return stats for specific service', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      await circuitBreakerService.execute('ai', mockFn);

      const stats = circuitBreakerService.getStats('ai');

      expect(stats).toHaveProperty('name');
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('successes');
      expect(stats).toHaveProperty('failures');
    });

    it('should return stats for all services', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      await circuitBreakerService.execute('ai', mockFn);
      await circuitBreakerService.execute('twitter', mockFn);

      const stats = circuitBreakerService.getStats();

      expect(Array.isArray(stats)).toBe(true);
      expect((stats as CircuitStats[]).length).toBeGreaterThan(0);
    });
  });

  describe('Service-Specific Configurations', () => {
    it('should use AI-specific configuration', async () => {
      const breaker = circuitBreakerService.getBreaker('ai');
      expect((breaker as any).options.timeout).toBe(30000); // AI has 30s timeout
    });

    it('should use Twitter-specific configuration', async () => {
      const breaker = circuitBreakerService.getBreaker('twitter');
      expect((breaker as any).options.timeout).toBe(10000); // Twitter has 10s timeout
    });

    it('should use Translation-specific configuration', async () => {
      const breaker = circuitBreakerService.getBreaker('translation');
      expect((breaker as any).options.timeout).toBe(15000); // Translation has 15s timeout
    });
  });

  describe('Fallback Strategies', () => {
    it('should register custom fallback handler', async () => {
      const customFallback = jest.fn().mockReturnValue('custom-fallback');
      circuitBreakerService.registerFallback('ai', customFallback);

      const mockFn = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await circuitBreakerService.execute('ai', mockFn);

      expect(result).toBe('custom-fallback');
      expect(customFallback).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle CircuitBreakerError', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('API Error'));

      try {
        await circuitBreakerService.execute('twitter', mockFn);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should preserve original error information', async () => {
      const originalError = new Error('Original API Error');
      const mockFn = jest.fn().mockRejectedValue(originalError);

      try {
        await circuitBreakerService.execute('twitter', mockFn);
      } catch (error) {
        expect(error).toBe(originalError);
      }
    });
  });
});
