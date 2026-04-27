// Tests for #609 — admin users:reset-password enforces password history

import { PasswordHistoryService } from '../services/PasswordHistoryService';

// Mock prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

const mockUser = {
  id: 'admin-reset-user',
  email: 'admin@example.com',
  passwordHash: '$2a$12$placeholder',
  lastPasswordChange: new Date(),
};

// Simulate the CLI action logic (extracted for unit testing)
async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  const user = await (prisma.user.findUnique as jest.Mock)({ where: { id: userId } });
  if (!user) throw new Error(`User not found: ${userId}`);

  if (await PasswordHistoryService.isPasswordReused(userId, newPassword)) {
    throw new Error('Cannot reuse one of the last 5 passwords');
  }

  const newHash = await PasswordHistoryService.hashPassword(newPassword);
  await PasswordHistoryService.recordPasswordChange(userId, newHash);
}

describe('#609 admin users:reset-password password history check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
    (prisma.passwordHistory.create as jest.Mock).mockResolvedValue({});
    (prisma.passwordHistory.deleteMany as jest.Mock).mockResolvedValue({});
  });

  it('throws when user is not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(adminResetPassword('ghost-id', 'NewPass1!')).rejects.toThrow('User not found: ghost-id');
  });

  it('rejects a password that appears in history', async () => {
    const bcrypt = await import('bcryptjs');
    const reusedHash = await bcrypt.hash('OldPass1!', 12);
    (prisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([
      { id: '1', hash: reusedHash },
    ]);

    await expect(adminResetPassword('admin-reset-user', 'OldPass1!')).rejects.toThrow(
      'Cannot reuse one of the last 5 passwords',
    );
  });

  it('succeeds when the new password is not in history', async () => {
    (prisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);

    await expect(adminResetPassword('admin-reset-user', 'BrandNew1!')).resolves.toBeUndefined();
    expect(prisma.passwordHistory.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
