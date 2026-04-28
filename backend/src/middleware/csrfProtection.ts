import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';

const logger = createLogger('middleware:csrfProtection');

/**
 * Allowed origins per environment — mirrors the list in config/cors.ts so
 * both layers stay in sync without coupling them at import time.
 */
const ALLOWED_ORIGINS: Record<string, string[]> = {
  development: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  test: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  staging: ['https://staging.socialflow.app'],
  production: ['https://socialflow.app', 'https://www.socialflow.app'],
};

function resolveAllowedOrigins(): string[] {
  const env = process.env.NODE_ENV ?? 'development';
  return ALLOWED_ORIGINS[env] ?? ALLOWED_ORIGINS.development;
}

/**
 * Extract the scheme+host origin from a full URL string.
 * Returns null if the URL is unparseable.
 */
function originFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin; // e.g. "https://socialflow.app"
  } catch {
    return null;
  }
}

/**
 * CSRF origin-check middleware for state-changing auth endpoints.
 *
 * Strategy:
 *  1. Requests that carry an `Authorization: Bearer` header are API / mobile
 *     clients — they are not susceptible to CSRF (no cookie-based auth) and
 *     are passed through unconditionally.
 *  2. For all other requests the `Origin` header is checked first; if absent
 *     the `Referer` header is used as a fallback.
 *  3. In non-production environments a missing origin is allowed (server-to-
 *     server calls, curl, Postman, etc.).  In production a missing origin is
 *     rejected to prevent blind CSRF from same-site navigations.
 *  4. If the resolved origin is not in the allow-list the request is rejected
 *     with 403.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Bearer-token clients are not CSRF-vulnerable — skip the check entirely.
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const allowedOrigins = resolveAllowedOrigins();
  const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

  // Prefer the Origin header; fall back to the origin portion of Referer.
  const rawOrigin = req.headers.origin as string | undefined;
  const rawReferer = req.headers.referer as string | undefined;

  let requestOrigin: string | null = null;

  if (rawOrigin) {
    requestOrigin = rawOrigin;
  } else if (rawReferer) {
    requestOrigin = originFromUrl(rawReferer);
  }

  // No origin information at all.
  if (!requestOrigin) {
    if (isProduction) {
      logger.warn('CSRF: missing Origin/Referer in production', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      res.status(403).json({ message: 'CSRF check failed: missing origin' });
      return;
    }
    // Non-production: allow server-to-server / tooling requests.
    return next();
  }

  if (allowedOrigins.includes(requestOrigin)) {
    return next();
  }

  logger.warn('CSRF: cross-origin request blocked', {
    requestOrigin,
    allowedOrigins,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.status(403).json({ message: 'CSRF check failed: origin not allowed' });
}
