import { UserRepository } from '../repositories/UserRepository';
import { PrismaClient, User } from '@prisma/client';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------
const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hashed',
  role: 'user',
  refreshTokens: [],
  lastPasswordChange: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  deletedAt: null,
};

const userMock = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

// Cast to PrismaClient so TypeScript is happy
const prismaMock = { user: userMock } as unknown as PrismaClient;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserRepository(prismaMock);
  });

  // ── findById ──────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('returns the user when found', async () => {
      userMock.findUnique.mockResolvedValue(mockUser);
      const result = await repo.findById('user-1');
      expect(result).toEqual(mockUser);
      expect(userMock.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('returns null when not found', async () => {
      userMock.findUnique.mockResolvedValue(null);
      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  // ── findByEmail ───────────────────────────────────────────────────────────
  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      userMock.findUnique.mockResolvedValue(mockUser);
      const result = await repo.findByEmail('test@example.com');
      expect(result).toEqual(mockUser);
      expect(userMock.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('returns null when not found', async () => {
      userMock.findUnique.mockResolvedValue(null);
      const result = await repo.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates and returns the new user', async () => {
      userMock.create.mockResolvedValue(mockUser);
      const input = { email: 'test@example.com', passwordHash: 'hashed' };
      const result = await repo.create(input);
      expect(result).toEqual(mockUser);
      expect(userMock.create).toHaveBeenCalledWith({ data: input });
    });

    it('propagates Prisma errors (e.g. duplicate email)', async () => {
      const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      userMock.create.mockRejectedValue(error);
      await expect(
        repo.create({ email: 'dupe@example.com', passwordHash: 'x' }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('returns the updated user', async () => {
      const updated = { ...mockUser, role: 'admin' };
      userMock.update.mockResolvedValue(updated);
      const result = await repo.update('user-1', { role: 'admin' });
      expect(result).toEqual(updated);
      expect(userMock.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'admin' },
      });
    });

    it('returns null when user does not exist (P2025)', async () => {
      userMock.update.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));
      const result = await repo.update('missing', { role: 'admin' });
      expect(result).toBeNull();
    });

    it('re-throws unexpected errors', async () => {
      userMock.update.mockRejectedValue(new Error('DB connection lost'));
      await expect(repo.update('user-1', {})).rejects.toThrow('DB connection lost');
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('returns the deleted user', async () => {
      userMock.delete.mockResolvedValue(mockUser);
      const result = await repo.delete('user-1');
      expect(result).toEqual(mockUser);
      expect(userMock.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('returns null when user does not exist (P2025)', async () => {
      userMock.delete.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));
      const result = await repo.delete('missing');
      expect(result).toBeNull();
    });

    it('re-throws unexpected errors', async () => {
      userMock.delete.mockRejectedValue(new Error('DB connection lost'));
      await expect(repo.delete('user-1')).rejects.toThrow('DB connection lost');
    });
  });
});
