import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context storage
 * Uses Node.js AsyncLocalStorage to maintain request context across async operations
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/**
 * UUID v4 validation regex.
 * Accepts the canonical hyphenated form: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where y is one of 8, 9, a, or b.
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a well-formed UUID v4.
 * Returns true only for the canonical hyphenated format to prevent
 * log-injection attacks via newlines, control characters, or arbitrary strings.
 */
export function isValidUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each incoming request and:
 * - Stores it in AsyncLocalStorage for context-aware logging
 * - Adds it to response headers (X-Request-Id)
 * - Attaches it to the request object
 *
 * The request ID is:
 * - Accepted from the client via X-Request-Id header **only** when it is a
 *   valid UUID v4 (prevents log-injection via arbitrary header values).
 * - Generated automatically (crypto.randomUUID / UUID v4) in all other cases.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const clientId = req.headers['x-request-id'] as string | undefined;

  // Accept the client-supplied value only when it passes UUID v4 validation.
  // Any other value (empty string, newline-containing string, arbitrary text)
  // is silently replaced with a freshly generated UUID.
  const requestId =
    clientId && isValidUuidV4(clientId) ? clientId : uuidv4();

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
