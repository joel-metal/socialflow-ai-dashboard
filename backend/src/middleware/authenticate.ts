import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthBlacklistService } from '../services/AuthBlacklistService';
import { config } from '../config/config';

export interface AuthRequest extends Request {
  user?: { id: string };
  /** @deprecated Use req.user.id instead */
  userId?: string;
  activeOrgId?: string;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired access token' });
    return;
  }

  const tokenKey = AuthBlacklistService.keyFromPayload(payload);
  if (await AuthBlacklistService.isBlacklisted(tokenKey)) {
    res.status(401).json({ message: 'Token has been revoked' });
    return;
  }

  const userId = payload.sub as string;
  req.user = { id: userId };
  // Keep req.userId for backward-compat with downstream middleware (checkPermission, requireCredits, etc.)
  req.userId = userId;
  next();
}
