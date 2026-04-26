import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { AuthBlacklistService } from '../services/AuthBlacklistService';

export interface GraphQLContext {
  /** Authenticated user ID, or undefined for unauthenticated requests. */
  userId?: string;
  /**
   * Stable token key derived from the JWT payload (jti or sub:iat).
   * Present whenever a valid (signature-verified) Bearer token was supplied,
   * even if the token has been blacklisted. Used by requireAuth to enforce
   * the blacklist check at the resolver layer.
   */
  tokenKey?: string;
}

const JWT_SECRET = () => process.env.JWT_SECRET ?? 'change-me-in-production';

/**
 * Build the per-request GraphQL context.
 *
 * Validates the Bearer token (if present) using the same logic as the REST
 * authenticate middleware so auth behaviour is consistent across both APIs.
 * Unauthenticated requests are allowed through — resolvers that require auth
 * call requireAuth() themselves.
 */
export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return {};

  const token = authHeader.slice(7);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET()) as jwt.JwtPayload;
  } catch {
    return {};
  }

  const tokenKey = AuthBlacklistService.keyFromPayload(payload);
  if (await AuthBlacklistService.isBlacklisted(tokenKey)) return {};

  return { userId: payload.sub as string, tokenKey };
}
