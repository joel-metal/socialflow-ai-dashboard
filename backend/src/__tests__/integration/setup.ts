/**
 * Shared setup for E2E integration tests.
 *
 * Sets required env vars and mocks all external dependencies (Prisma, Redis,
 * third-party APIs) so the full request-response cycle runs without real
 * infrastructure. In-memory stores are cleared after each test.
 */

// ── Env vars (must be set before any module is imported) ─────────────────────
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-test-secret-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-32ch';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/socialflow_test';
process.env.TWITTER_API_KEY = 'test-key';
process.env.TWITTER_API_SECRET = 'test-secret';

// ── In-memory stores ──────────────────────────────────────────────────────────
const orgStore = new Map<string, any>();
const memberStore = new Map<string, any>();
const postStore = new Map<string, any>();
const redisStore = new Map<string, string>();

// ── Mock @prisma/client (catches any direct `new PrismaClient()` calls) ───────
const mockPrisma = {
  organization: {
    findUnique: jest.fn(({ where }: any) =>
      Promise.resolve(orgStore.get(where.id ?? where.slug) ?? null),
    ),
    create: jest.fn(({ data }: any) => {
      const org = { id: data.id, name: data.name, slug: data.slug, members: [] as any[] };
      orgStore.set(org.id, org);
      orgStore.set(org.slug, org);
      if (data.members?.create) {
        const m = { ...data.members.create, organizationId: org.id };
        memberStore.set(`${org.id}:${m.userId}`, m);
        org.members.push(m);
      }
      return Promise.resolve(org);
    }),
  },
  organizationMember: {
    findUnique: jest.fn(({ where }: any) => {
      const k = where.organizationId_userId;
      return Promise.resolve(
        k ? (memberStore.get(`${k.organizationId}:${k.userId}`) ?? null) : null,
      );
    }),
    findMany: jest.fn(({ where }: any) =>
      Promise.resolve([...memberStore.values()].filter((m) => m.userId === where.userId)),
    ),
    count: jest.fn(({ where }: any) =>
      Promise.resolve(
        [...memberStore.values()].filter((m) => m.userId === where.userId).length,
      ),
    ),
    create: jest.fn(({ data }: any) => {
      const m = { ...data };
      memberStore.set(`${data.organizationId}:${data.userId}`, m);
      return Promise.resolve(m);
    }),
    delete: jest.fn(({ where }: any) => {
      const k = `${where.organizationId_userId.organizationId}:${where.organizationId_userId.userId}`;
      const m = memberStore.get(k);
      memberStore.delete(k);
      return Promise.resolve(m);
    }),
  },
  post: {
    create: jest.fn(({ data }: any) => {
      const post = { ...data, createdAt: new Date(), updatedAt: new Date() };
      postStore.set(post.id, post);
      return Promise.resolve(post);
    }),
  },
  user: { findUnique: jest.fn(() => Promise.resolve(null)) },
  listing: {
    findMany: jest.fn(() => Promise.resolve([])),
    findUnique: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(() => Promise.resolve(null)),
  },
  cohort: { findMany: jest.fn(() => Promise.resolve([]) ) },
  $use: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }));
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../shared/lib/prisma', () => ({ prisma: mockPrisma }));

// ── Mock Redis ────────────────────────────────────────────────────────────────
jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    call: jest.fn(() => Promise.resolve(null)),
  })),
);

// ── Mock config/runtime (provides getAdminIpWhitelist etc.) ──────────────────
jest.mock('../../config/runtime', () => ({
  getAdminIpWhitelist: jest.fn(() => []),
  getRedisConnection: jest.fn(() => ({ host: '127.0.0.1', port: 6379 })),
  getBackendPort: jest.fn(() => 3001),
  getBoolean: jest.fn((_v: any, fallback: boolean) => fallback),
  getNumber: jest.fn((_v: any, fallback: number) => fallback),
  getConfiguredQueueNames: jest.fn(() => []),
  getDataRetentionConfig: jest.fn(() => ({})),
}));

// ── Mock external / heavy services ───────────────────────────────────────────
jest.mock('../../services/ModerationService', () => ({
  ModerationService: {
    moderate: jest.fn(() =>
      Promise.resolve({ flagged: false, blocked: false, categories: {}, scores: {} }),
    ),
  },
}));

jest.mock('../../utils/cache', () => ({
  withCache: jest.fn((_k: string, _t: number, fn: () => any) => fn()),
  invalidateCache: jest.fn(() => Promise.resolve()),
  invalidateCachePattern: jest.fn(() => Promise.resolve()),
  CacheTTL: { ORG: 60, ORG_LIST: 60 },
}));

jest.mock('../../services/serviceFactory', () => ({
  getHealthService: jest.fn(() => ({
    getSystemStatus: jest.fn(() =>
      Promise.resolve({ overallStatus: 'healthy', services: {} }),
    ),
  })),
  getHealthMonitor: jest.fn(() => ({ getMetrics: jest.fn(() => []) })),
  getAlertConfigService: jest.fn(() => ({
    getConfig: jest.fn(() => ({})),
    setConfig: jest.fn(),
  })),
}));

jest.mock('../../services/healthService', () => ({
  healthService: {
    getSystemStatus: jest.fn(() =>
      Promise.resolve({ overallStatus: 'healthy', services: {} }),
    ),
  },
}));

jest.mock('../../services/DynamicConfigService', () => ({
  dynamicConfigService: { get: jest.fn(() => 10) },
  ConfigKey: { RATE_LIMIT_MAX: 'RATE_LIMIT_MAX' },
}));

// ── Teardown: reset all in-memory stores after each test ─────────────────────
afterEach(() => {
  redisStore.clear();
  orgStore.clear();
  memberStore.clear();
  postStore.clear();
});
