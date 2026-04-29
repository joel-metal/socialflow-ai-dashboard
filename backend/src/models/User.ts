import { prisma } from '../lib/prisma';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  refreshTokens: string[];
}

export const UserStore = {
  findByEmail: (email: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { email } }),

  findById: (id: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { id } }),

  create: (user: User): Promise<User> =>
    prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt,
        refreshTokens: user.refreshTokens,
      },
    }),

  update: (id: string, patch: Partial<User>): Promise<User | null> =>
    prisma.user.update({ where: { id }, data: patch }).catch(() => null),

  /** Delete all users — intended for test teardown only. */
  clear: (): Promise<void> =>
    prisma.user.deleteMany().then(() => undefined),
};
