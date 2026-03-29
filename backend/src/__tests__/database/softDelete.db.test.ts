/**
 * Database integration tests — soft-delete middleware (real DB)
 *
 * Verifies that the Prisma soft-delete middleware correctly intercepts
 * delete/find operations on User and Listing models against a real schema.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createTestPrisma, truncateAll } from './dbClient';

let db: PrismaClient;

beforeAll(async () => {
  db = createTestPrisma();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
});

function makeUser() {
  return {
    id: randomUUID(),
    email: `u-${randomUUID()}@example.com`,
    passwordHash: 'hash',
    refreshTokens: [] as string[],
    lastPasswordChange: new Date(),
  };
}

// ── User soft-delete ──────────────────────────────────────────────────────────
describe('Soft-delete — User model', () => {
  it('delete sets deletedAt; row survives in DB', async () => {
    const u = await db.user.create({ data: makeUser() });
    await db.user.delete({ where: { id: u.id } });

    const raw = await db.$queryRaw<any[]>`
      SELECT "deletedAt" FROM "User" WHERE id = ${u.id}
    `;
    expect(raw[0].deletedAt).not.toBeNull();
  });

  it('findMany excludes soft-deleted users', async () => {
    const u1 = await db.user.create({ data: makeUser() });
    const u2 = await db.user.create({ data: makeUser() });
    await db.user.delete({ where: { id: u1.id } });

    const results = await db.user.findMany();
    const ids = results.map((u: any) => u.id);
    expect(ids).not.toContain(u1.id);
    expect(ids).toContain(u2.id);
  });

  it('deleteMany soft-deletes all matched rows', async () => {
    const u1 = await db.user.create({ data: makeUser() });
    const u2 = await db.user.create({ data: makeUser() });

    await db.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });

    const remaining = await db.user.findMany();
    expect(remaining).toHaveLength(0);

    const raw = await db.$queryRaw<any[]>`
      SELECT id FROM "User" WHERE "deletedAt" IS NOT NULL
    `;
    expect(raw.map((r: any) => r.id)).toEqual(expect.arrayContaining([u1.id, u2.id]));
  });
});

// ── Listing soft-delete ───────────────────────────────────────────────────────
describe('Soft-delete — Listing model', () => {
  async function createUserAndListing() {
    const user = await db.user.create({ data: makeUser() });
    const listing = await db.listing.create({
      data: {
        id: randomUUID(),
        title: 'Test listing',
        description: 'desc',
        mentorId: user.id,
      },
    });
    return { user, listing };
  }

  it('delete sets deletedAt on listing', async () => {
    const { listing } = await createUserAndListing();
    await db.listing.delete({ where: { id: listing.id } });

    const raw = await db.$queryRaw<any[]>`
      SELECT "deletedAt" FROM "Listing" WHERE id = ${listing.id}
    `;
    expect(raw[0].deletedAt).not.toBeNull();
  });

  it('findMany excludes soft-deleted listings', async () => {
    const { listing } = await createUserAndListing();
    await db.listing.delete({ where: { id: listing.id } });

    const results = await db.listing.findMany();
    expect(results.map((l: any) => l.id)).not.toContain(listing.id);
  });
});

// ── Non-soft-delete model passes through ─────────────────────────────────────
describe('Hard-delete — non-soft-delete model (DynamicConfig)', () => {
  it('delete physically removes the row', async () => {
    await db.dynamicConfig.create({ data: { key: 'test-key', value: 'v', type: 'string' } });
    await db.dynamicConfig.delete({ where: { key: 'test-key' } });

    const raw = await db.$queryRaw<any[]>`
      SELECT key FROM "DynamicConfig" WHERE key = 'test-key'
    `;
    expect(raw).toHaveLength(0);
  });
});
