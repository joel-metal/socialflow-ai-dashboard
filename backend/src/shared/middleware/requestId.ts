import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context storage
 * Uses Node.js AsyncLocalStorage to maintain request context across async operations
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each incoming request and:
 * - Stores it in AsyncLocalStorage for context-aware logging
 * - Adds it to response headers (X-Request-Id)
 * - Attaches it to the request object
 *
 * The request ID can be:
 * - Generated automatically (UUID v4)
 * - Provided by client via X-Request-Id header (for request tracing)
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Check if client provided a request ID, otherwise generate one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Store in AsyncLocalStorage for context-aware logging
  requestContext.run({ requestId }, () => {
    // Attach to request object for easy access
    (req as any).requestId = requestId;

    // Add to response headers
    res.setHeader('X-Request-Id', requestId);

    next();
  });
};

/**
 * Get the current request ID from AsyncLocalStorage
 * Returns undefined if called outside of a request context
 */
export const getRequestId = (): string | undefined => {
  const store = requestContext.getStore();
  return store?.requestId;
};

/**
 * Type augmentation for Express Request
 * Adds requestId property to Request interface
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
