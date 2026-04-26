import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const PASSWORD_ROTATION_DAYS = 90;
const PASSWORD_HISTORY_LIMIT = 5;
const SALT_ROUNDS = 12;

export const PasswordHistoryService = {
  /**
   * Check if password rotation is required
   */
  isRotationRequired: async (userId: string): Promise<boolean> => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;

    const daysSinceChange = Math.floor(
      (Date.now() - user.lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysSinceChange >= PASSWORD_ROTATION_DAYS;
  },

  /**
   * Check if new password matches any of the last 5 passwords
   */
  isPasswordReused: async (userId: string, newPassword: string): Promise<boolean> => {
    const history = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
    });

    for (const entry of history) {
      if (await bcrypt.compare(newPassword, entry.hash)) {
        return true;
      }
    }
    return false;
  },

  /**
   * Add current password to history and update lastPasswordChange
   */
  recordPasswordChange: async (userId: string, newPasswordHash: string): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Add old password to history
    await prisma.passwordHistory.create({
      data: {
        userId,
        hash: user.passwordHash,
      },
    });

    // Update user with new password and timestamp
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        lastPasswordChange: new Date(),
      },
    });

    // Clean up old history entries (keep only last 5)
    const allHistory = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (allHistory.length > PASSWORD_HISTORY_LIMIT) {
      const toDelete = allHistory.slice(PASSWORD_HISTORY_LIMIT);
      await prisma.passwordHistory.deleteMany({
        where: {
          id: { in: toDelete.map((h) => h.id) },
        },
      });
    }
  },

  /**
   * Hash a password with salt
   */
  hashPassword: async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
  },
};
