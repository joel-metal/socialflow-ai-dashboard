import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { softDeleteMiddleware } from '../middleware/prismaSoftDelete';
import { applyReadWriteSplitting } from './readReplica';
import { config } from '../config/config';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const tracer = trace.getTracer('socialflow-db');

// Models that should be scoped to an organization
const ORG_SCOPED_MODELS = new Set(['Post', 'AnalyticsEntry', 'Listing']);

/**
 * Pool sizing defaults:
 *   development — small pool, fast feedback on connection leaks
 *   production  — sized for concurrent request handling
 *                 Rule of thumb: (2 × num_cores) + 1, capped at 20 for PgBouncer compat
 *
 * Both values can be overridden via DB_CONNECTION_LIMIT / DB_POOL_TIMEOUT env vars.
 */
const POOL_DEFAULTS = {
  development: { connection_limit: 5,  pool_timeout: 10 },
  test:        { connection_limit: 2,  pool_timeout: 10 },
  production:  { connection_limit: 10, pool_timeout: 20 },
} as const;

function buildDatasourceUrl(): string {
  const base = config.DATABASE_URL;
  const env = config.NODE_ENV;
  const defaults = POOL_DEFAULTS[env];

  const connectionLimit = config.DB_CONNECTION_LIMIT ?? defaults.connection_limit;
  const poolTimeout     = config.DB_POOL_TIMEOUT     ?? defaults.pool_timeout;

  const url = new URL(base);
  url.searchParams.set('connection_limit', String(connectionLimit));
  url.searchParams.set('pool_timeout',     String(poolTimeout));
  return url.toString();
}

function createInstrumentedPrisma(): PrismaClient {
  // Prisma v7 reads DATABASE_URL from the environment; inject pool params before construction
  process.env.DATABASE_URL = buildDatasourceUrl();
  const client = new PrismaClient();

  // Soft delete: convert deletes to updates and filter out deleted records
  client.$use(softDeleteMiddleware);

  // Wrap every query in a span via Prisma middleware
  // Tracing middleware
  client.$use(async (params, next) => {
    const spanName = `db.${params.model ?? 'unknown'}.${params.action}`;
    const span = tracer.startSpan(spanName, {
      attributes: {
        'db.system': 'postgresql',
        'db.operation': params.action,
        'db.prisma.model': params.model ?? '',
      },
    });

    try {
      const result = await next(params);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });

  // Org-scoping middleware — filters read/write queries by organizationId when provided
  client.$use(async (params, next) => {
    if (!params.model || !ORG_SCOPED_MODELS.has(params.model)) return next(params);

    const orgId: string | undefined = (params.args as Record<string, unknown>)?.__orgId as
      | string
      | undefined;
    if (!orgId) return next(params);

    // Remove the injected __orgId sentinel before forwarding
    if (params.args && typeof params.args === 'object') {
      delete (params.args as Record<string, unknown>).__orgId;
    }

    const readActions = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'];
    const writeActions = [
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ];

    if (readActions.includes(params.action)) {
      params.args = params.args ?? {};
      params.args.where = {
        ...(params.args.where ?? {}),
        organizationId: orgId,
      };
    } else if (writeActions.includes(params.action)) {
      if (params.action === 'create' || params.action === 'upsert') {
        params.args.data = {
          ...(params.args.data ?? {}),
          organizationId: orgId,
        };
      } else if (params.action === 'createMany') {
        const data = Array.isArray(params.args.data) ? params.args.data : [params.args.data];
        params.args.data = data.map((d: Record<string, unknown>) => ({
          ...d,
          organizationId: orgId,
        }));
      } else {
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId: orgId,
        };
      }
    }

    return next(params);
  });

  // Read/Write splitting — routes reads to replicas, writes to primary
  applyReadWriteSplitting(client);

  return client;
}

export const prisma = globalForPrisma.prisma ?? createInstrumentedPrisma();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
