/**
 * Shared database test client.
 *
 * Uses DATABASE_URL from the environment (set to a dedicated test DB).
 * Bypasses the instrumented singleton in lib/prisma so tests get a clean,
 * undecorated client they can control directly.
 *
 * Soft-delete middleware is applied here so tests exercise the real behaviour.
 */
import { PrismaClient } from '@prisma/client';
import { softDeleteMiddleware } from '../../middleware/prismaSoftDelete';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/socialflow_test';

export function createTestPrisma(): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: DATABASE_URL,
    log: [],
  });
  client.$use(softDeleteMiddleware);
  return client;
}

/**
 * Truncate all application tables in dependency order so each test suite
 * starts with a clean slate.
 */
export async function truncateAll(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PasswordHistory",
      "Post",
      "AnalyticsEntry",
      "OrganizationMember",
      "Organization",
      "Listing",
      "DynamicConfig",
      "User"
    RESTART IDENTITY CASCADE
  `);
}
