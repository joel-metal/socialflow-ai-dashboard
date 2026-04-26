/**
 * Database integration tests — ListingService
 *
 * Tests toggleVisibility (authorization + state change) and searchListings
 * (filtering, pagination, soft-delete exclusion) against a real DB.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ListingService } from '../../services/ListingService';
import { createTestPrisma, truncateAll } from './dbClient';

// ListingService instantiates its own PrismaClient — redirect it to the test DB
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => testDb),
  };
});

let testDb: PrismaClient;
let service: ListingService;

beforeAll(async () => {
  testDb = createTestPrisma();
  service = new ListingService();
});

afterAll(async () => {
  await testDb.$disconnect();
});

beforeEach(async () => {
  await truncateAll(testDb);
});

async function seedUserAndListing(overrides: { isActive?: boolean } = {}) {
  const user = await testDb.user.create({
    data: {
      id: randomUUID(),
      email: `mentor-${randomUUID()}@example.com`,
      passwordHash: 'hash',
      refreshTokens: [],
      lastPasswordChange: new Date(),
    },
  });
  const listing = await testDb.listing.create({
    data: {
      id: randomUUID(),
      title: 'TypeScript Mentoring',
      description: 'Learn TypeScript from scratch',
      price: 50,
      mentorId: user.id,
      isActive: overrides.isActive ?? true,
    },
  });
  return { user, listing };
}

// ── toggleVisibility ──────────────────────────────────────────────────────────
describe('ListingService.toggleVisibility', () => {
  it('deactivates an active listing', async () => {
    const { user, listing } = await seedUserAndListing({ isActive: true });
    const result = await service.toggleVisibility(listing.id, user.id, false);
    expect(result.isActive).toBe(false);
  });

  it('activates an inactive listing', async () => {
    const { user, listing } = await seedUserAndListing({ isActive: false });
    const result = await service.toggleVisibility(listing.id, user.id, true);
    expect(result.isActive).toBe(true);
  });

  it('throws when listing does not exist', async () => {
    const { user } = await seedUserAndListing();
    await expect(service.toggleVisibility(randomUUID(), user.id, false)).rejects.toThrow(
      'Listing not found',
    );
  });

  it('throws when caller is not the owner', async () => {
    const { listing } = await seedUserAndListing();
    const otherUser = await testDb.user.create({
      data: {
        id: randomUUID(),
        email: `other-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        refreshTokens: [],
        lastPasswordChange: new Date(),
      },
    });
    await expect(service.toggleVisibility(listing.id, otherUser.id, false)).rejects.toThrow(
      'Unauthorized',
    );
  });
});

// ── searchListings ────────────────────────────────────────────────────────────
describe('ListingService.searchListings', () => {
  beforeEach(async () => {
    const user = await testDb.user.create({
      data: {
        id: randomUUID(),
        email: `search-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        refreshTokens: [],
        lastPasswordChange: new Date(),
      },
    });
    await testDb.listing.createMany({
      data: [
        { id: randomUUID(), title: 'React Basics', description: 'Intro to React', mentorId: user.id, isActive: true },
        { id: randomUUID(), title: 'Advanced Node', description: 'Node.js deep dive', mentorId: user.id, isActive: true },
        { id: randomUUID(), title: 'Hidden Course', description: 'Not visible', mentorId: user.id, isActive: false },
      ],
    });
  });

  it('returns only active listings', async () => {
    const { data, total } = await service.searchListings('', { page: 1, limit: 10 });
    expect(total).toBe(2);
    expect(data.every((l: any) => l.isActive)).toBe(true);
  });

  it('filters by title keyword (case-insensitive)', async () => {
    const { data, total } = await service.searchListings('react', { page: 1, limit: 10 });
    expect(total).toBe(1);
    expect(data[0].title).toBe('React Basics');
  });

  it('filters by description keyword', async () => {
    const { data } = await service.searchListings('deep dive', { page: 1, limit: 10 });
    expect(data[0].title).toBe('Advanced Node');
  });

  it('returns empty when no match', async () => {
    const { data, total } = await service.searchListings('python', { page: 1, limit: 10 });
    expect(total).toBe(0);
    expect(data).toHaveLength(0);
  });

  it('respects pagination', async () => {
    const { data, total } = await service.searchListings('', { page: 1, limit: 1 });
    expect(total).toBe(2);
    expect(data).toHaveLength(1);
  });

  it('excludes soft-deleted listings', async () => {
    const { data: all } = await service.searchListings('', { page: 1, limit: 10 });
    const id = all[0].id;
    await testDb.listing.delete({ where: { id } });

    const { total } = await service.searchListings('', { page: 1, limit: 10 });
    expect(total).toBe(1);
  });
});
