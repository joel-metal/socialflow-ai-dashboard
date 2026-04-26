/**
 * Database integration tests — Organization & Post transactions
 *
 * Verifies cascading deletes, member uniqueness constraints, and
 * org-scoped post queries against a real DB.
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

async function createUser() {
  return db.user.create({
    data: {
      id: randomUUID(),
      email: `u-${randomUUID()}@example.com`,
      passwordHash: 'hash',
      refreshTokens: [],
      lastPasswordChange: new Date(),
    },
  });
}

async function createOrg(name = 'Acme') {
  return db.organization.create({
    data: { id: randomUUID(), name, slug: `slug-${randomUUID()}` },
  });
}

// ── OrganizationMember uniqueness ─────────────────────────────────────────────
describe('OrganizationMember — unique constraint', () => {
  it('prevents duplicate (organizationId, userId) pairs', async () => {
    const user = await createUser();
    const org = await createOrg();

    await db.organizationMember.create({
      data: { id: randomUUID(), organizationId: org.id, userId: user.id, role: 'member' },
    });

    await expect(
      db.organizationMember.create({
        data: { id: randomUUID(), organizationId: org.id, userId: user.id, role: 'admin' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

// ── Cascade delete: Organization → Members & Posts ────────────────────────────
describe('Organization cascade delete', () => {
  it('deletes members and posts when organization is deleted', async () => {
    const user = await createUser();
    const org = await createOrg();

    await db.organizationMember.create({
      data: { id: randomUUID(), organizationId: org.id, userId: user.id },
    });
    await db.post.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        content: 'Hello',
        platform: 'twitter',
      },
    });

    await db.organization.delete({ where: { id: org.id } });

    const members = await db.organizationMember.findMany({ where: { organizationId: org.id } });
    const posts = await db.post.findMany({ where: { organizationId: org.id } });

    expect(members).toHaveLength(0);
    expect(posts).toHaveLength(0);
  });
});

// ── Post queries scoped to organization ───────────────────────────────────────
describe('Post — org-scoped queries', () => {
  it('only returns posts belonging to the queried organization', async () => {
    const org1 = await createOrg('Org1');
    const org2 = await createOrg('Org2');

    await db.post.create({
      data: { id: randomUUID(), organizationId: org1.id, content: 'Org1 post', platform: 'twitter' },
    });
    await db.post.create({
      data: { id: randomUUID(), organizationId: org2.id, content: 'Org2 post', platform: 'linkedin' },
    });

    const org1Posts = await db.post.findMany({ where: { organizationId: org1.id } });
    expect(org1Posts).toHaveLength(1);
    expect(org1Posts[0].content).toBe('Org1 post');
  });
});

// ── Transaction rollback on failure ──────────────────────────────────────────
describe('Transaction integrity', () => {
  it('rolls back all writes when one operation fails', async () => {
    const user = await createUser();
    const org = await createOrg();

    await expect(
      db.$transaction(async (tx) => {
        await tx.organizationMember.create({
          data: { id: randomUUID(), organizationId: org.id, userId: user.id },
        });
        // Force a failure — duplicate slug
        await tx.organization.create({
          data: { id: randomUUID(), name: 'Dup', slug: org.slug },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // Member created inside the transaction must have been rolled back
    const members = await db.organizationMember.findMany({ where: { organizationId: org.id } });
    expect(members).toHaveLength(0);
  });
});
