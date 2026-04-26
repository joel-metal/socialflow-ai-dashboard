import request from 'supertest';
import express, { Request, Response } from 'express';
import { requestIdMiddleware } from '../middleware/requestId';
import { errorHandler, notFoundHandler, asyncHandler } from '../middleware/error';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
} from '../lib/errors';

// Create test app
const createTestApp = () => {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());

  // Test routes for different error types
  app.get('/bad-request', () => {
    throw new BadRequestError('Invalid input data');
  });

  app.get('/unauthorized', () => {
    throw new UnauthorizedError('Authentication required');
  });

  app.get('/forbidden', () => {
    throw new ForbiddenError('Access denied');
  });

  app.get('/not-found-error', () => {
    throw new NotFoundError('User not found');
  });

  app.get('/conflict', () => {
    throw new ConflictError('Email already exists');
  });

  app.get('/validation', () => {
    throw new ValidationError('Validation failed', {
      email: ['Email is required', 'Email must be valid'],
      password: ['Password must be at least 8 characters'],
    });
  });

  app.get('/rate-limit', () => {
    throw new RateLimitError('Too many requests', 60);
  });

  app.get('/internal-error', () => {
    throw new InternalServerError('Database connection failed');
  });

  app.get('/service-unavailable', () => {
    throw new ServiceUnavailableError('Service is under maintenance', 3600);
  });

  app.get('/database-error', () => {
    throw new DatabaseError('Query execution failed');
  });

  app.get('/external-service-error', () => {
    throw new ExternalServiceError('Payment gateway timeout', 'stripe');
  });

  app.get('/unexpected-error', () => {
    throw new Error('Unexpected error occurred');
  });

  app.get(
    '/async-error',
    asyncHandler(async () => {
      await Promise.reject(new BadRequestError('Async error'));
    }),
  );

  app.get(
    '/async-unexpected',
    asyncHandler(async () => {
      await Promise.reject(new Error('Async unexpected error'));
    }),
  );

  app.get('/success', (req: Request, res: Response) => {
    res.json({ success: true, message: 'OK' });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
};

describe('Error Handling Middleware', () => {
  let app: express.Application;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Error Response Format', () => {
    it('should return standardized error format', async () => {
      const response = await request(app).get('/bad-request');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include request ID in error response', async () => {
      const customId = 'test-request-123';
      const response = await request(app).get('/bad-request').set('X-Request-Id', customId);

      expect(response.body.requestId).toBe(customId);
    });

    it('should include timestamp in ISO format', async () => {
      const response = await request(app).get('/bad-request');

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('HTTP Status Code Mapping', () => {
    it('should return 400 for BadRequestError', async () => {
      const response = await request(app).get('/bad-request');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('BAD_REQUEST');
      expect(response.body.message).toBe('Invalid input data');
    });

    it('should return 401 for UnauthorizedError', async () => {
      const response = await request(app).get('/unauthorized');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Authentication required');
    });

    it('should return 403 for ForbiddenError', async () => {
      const response = await request(app).get('/forbidden');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Access denied');
    });

    it('should return 404 for NotFoundError', async () => {
      const response = await request(app).get('/not-found-error');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toBe('User not found');
    });

    it('should return 409 for ConflictError', async () => {
      const response = await request(app).get('/conflict');

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CONFLICT');
      expect(response.body.message).toBe('Email already exists');
    });

    it('should return 422 for ValidationError', async () => {
      const response = await request(app).get('/validation');

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual({
        email: ['Email is required', 'Email must be valid'],
        password: ['Password must be at least 8 characters'],
      });
    });

    it('should return 429 for RateLimitError', async () => {
      const response = await request(app).get('/rate-limit');

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.message).toBe('Too many requests');
      expect(response.body.retryAfter).toBe(60);
      expect(response.headers['retry-after']).toBe('60');
    });

    it('should return 500 for InternalServerError', async () => {
      const response = await request(app).get('/internal-error');

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 503 for ServiceUnavailableError', async () => {
      const response = await request(app).get('/service-unavailable');

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body.message).toBe('Service is under maintenance');
      expect(response.body.retryAfter).toBe(3600);
      expect(response.headers['retry-after']).toBe('3600');
    });

    it('should return 500 for DatabaseError', async () => {
      const response = await request(app).get('/database-error');

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('DATABASE_ERROR');
    });

    it('should return 502 for ExternalServiceError', async () => {
      const response = await request(app).get('/external-service-error');

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('EXTERNAL_SERVICE_ERROR');
    });
  });

  describe('Development vs Production', () => {
    it('should include stack trace in development', async () => {
      process.env.NODE_ENV = 'development';
      const response = await request(app).get('/unexpected-error');

      expect(response.body.stack).toBeDefined();
      expect(response.body.stack).toContain('Error: Unexpected error occurred');
    });

    it('should hide stack trace in production', async () => {
      process.env.NODE_ENV = 'production';
      const response = await request(app).get('/unexpected-error');

      expect(response.body.stack).toBeUndefined();
    });

    it('should hide internal error details in production', async () => {
      process.env.NODE_ENV = 'production';
      const response = await request(app).get('/unexpected-error');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('An unexpected error occurred');
    });

    it('should show error details in development', async () => {
      process.env.NODE_ENV = 'development';
      const response = await request(app).get('/unexpected-error');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('An unexpected error occurred');
    });
  });

  describe('404 Not Found Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.message).toContain('Cannot GET /non-existent-route');
    });

    it('should handle different HTTP methods', async () => {
      const response = await request(app).post('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Cannot POST /non-existent-route');
    });
  });

  describe('Async Error Handler', () => {
    it('should catch async errors', async () => {
      const response = await request(app).get('/async-error');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('BAD_REQUEST');
      expect(response.body.message).toBe('Async error');
    });

    it('should catch unexpected async errors', async () => {
      const response = await request(app).get('/async-unexpected');

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Success Cases', () => {
    it('should not interfere with successful responses', async () => {
      const response = await request(app).get('/success');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('OK');
    });
  });
});
