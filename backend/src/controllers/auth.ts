import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { UserStore } from '../models/User';
import { auditLogger } from '../services/AuditLogger';
import { PasswordHistoryService } from '../services/PasswordHistoryService';
import { AuthBlacklistService } from '../services/AuthBlacklistService';
import { prisma } from '../lib/prisma';
import { config } from '../config/config';

const SALT_ROUNDS = 12;

const jwtSecret = () => config.JWT_SECRET;
const jwtExpiresIn = () => config.JWT_EXPIRES_IN;
const jwtRefreshSecret = () => config.JWT_REFRESH_SECRET;
const jwtRefreshExpiresIn = () => config.JWT_REFRESH_EXPIRES_IN;

function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: jwtExpiresIn() } as jwt.SignOptions);
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, jti: randomUUID() }, jwtRefreshSecret(), {
    expiresIn: jwtRefreshExpiresIn(),
  } as jwt.SignOptions);
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  if (UserStore.findByEmail(email)) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = UserStore.create({
    id: randomUUID(),
    email,
    passwordHash,
    createdAt: new Date(),
    refreshTokens: [],
  });

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id);
  UserStore.update(user.id, { refreshTokens: [refreshToken] });

  auditLogger.log({
    actorId: user.id,
    action: 'auth:register',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ accessToken, refreshToken });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const user = UserStore.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  // Check if password rotation is required
  const rotationRequired = await PasswordHistoryService.isRotationRequired(user.id);

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id);
  UserStore.update(user.id, { refreshTokens: [...user.refreshTokens, refreshToken] });

  auditLogger.log({
    actorId: user.id,
    action: 'auth:login',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ accessToken, refreshToken, passwordRotationRequired: rotationRequired });
}

export function refresh(req: Request, res: Response): void {
  const { refreshToken } = req.body as { refreshToken: string };

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, jwtRefreshSecret()) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
    return;
  }

  const user = UserStore.findById(payload.sub as string);
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    res.status(401).json({ message: 'Refresh token revoked' });
    return;
  }

  // Rotate refresh token
  const newRefresh = signRefresh(user.id);
  UserStore.update(user.id, {
    refreshTokens: [...user.refreshTokens.filter((t) => t !== refreshToken), newRefresh],
  });

  res.json({ accessToken: signAccess(user.id), refreshToken: newRefresh });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, jwtRefreshSecret()) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }

  const user = UserStore.findById(payload.sub as string);
  if (user) {
    UserStore.update(user.id, {
      refreshTokens: user.refreshTokens.filter((t) => t !== refreshToken),
    });
    auditLogger.log({
      actorId: user.id,
      action: 'auth:logout',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // Blacklist the current access token if present in the Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.slice(7);
    try {
      const accessPayload = jwt.verify(accessToken, jwtSecret()) as jwt.JwtPayload;
      const tokenKey = AuthBlacklistService.keyFromPayload(accessPayload);
      const ttl = accessPayload.exp
        ? accessPayload.exp - Math.floor(Date.now() / 1000)
        : AuthBlacklistService.accessTokenTTL();
      await AuthBlacklistService.blacklistToken(tokenKey, ttl);
    } catch {
      // Access token already expired or invalid — nothing to blacklist
    }
  }

  res.status(204).send();
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  // Verify current password
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ message: 'Current password is incorrect' });
    return;
  }

  // Check if new password was recently used
  if (await PasswordHistoryService.isPasswordReused(userId, newPassword)) {
    res.status(400).json({ message: 'Cannot reuse one of your last 5 passwords' });
    return;
  }

  // Hash and record the new password
  const newPasswordHash = await PasswordHistoryService.hashPassword(newPassword);
  await PasswordHistoryService.recordPasswordChange(userId, newPasswordHash);

  // Blacklist the current access token — forces re-login after password change
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.slice(7);
    try {
      const accessPayload = jwt.verify(accessToken, jwtSecret()) as jwt.JwtPayload;
      const tokenKey = AuthBlacklistService.keyFromPayload(accessPayload);
      const ttl = accessPayload.exp
        ? accessPayload.exp - Math.floor(Date.now() / 1000)
        : AuthBlacklistService.accessTokenTTL();
      await AuthBlacklistService.blacklistToken(tokenKey, ttl);
    } catch {
      // Token already expired — nothing to blacklist
    }
  }

  auditLogger.log({
    actorId: userId,
    action: 'auth:change-password',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ message: 'Password changed successfully' });
}
