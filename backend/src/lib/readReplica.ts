import { config } from '../config/config';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createLogger } from './logger';

const logger = createLogger('read-replica');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplicaConfig {
  url: string;
  /** Relative weight for load distribution. Default 1. */
  weight?: number;
}

// Actions that are safe to route to a read replica
const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// ---------------------------------------------------------------------------
// Weighted replica picker
// ---------------------------------------------------------------------------

/**
 * Picks a replica URL using weighted random selection.
 * Falls back to the primary URL if no replicas are configured.
 */
function pickReplica(replicas: Required<ReplicaConfig>[], primaryUrl: string): string {
  if (!replicas.length) return primaryUrl;

  const total = replicas.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * total;

  for (const replica of replicas) {
    rand -= replica.weight;
    if (rand <= 0) return replica.url;
  }

  return replicas[replicas.length - 1].url;
}

// ---------------------------------------------------------------------------
// Replica client pool
// ---------------------------------------------------------------------------

const replicaPool = new Map<string, PrismaClient>();

function getReplicaClient(url: string): PrismaClient {
  if (!replicaPool.has(url)) {
    replicaPool.set(url, new PrismaClient({ datasourceUrl: url }));
  }
  return replicaPool.get(url)!;
}

// ---------------------------------------------------------------------------
// Parse replica config from environment
//
// Env vars:
//   DATABASE_REPLICA_URLS  – comma-separated list of replica connection strings
//   DATABASE_REPLICA_WEIGHTS – comma-separated weights matching the URLs above
//
// Example:
//   DATABASE_REPLICA_URLS=postgres://replica1/db,postgres://replica2/db
//   DATABASE_REPLICA_WEIGHTS=2,1   (replica1 gets 2x traffic)
// ---------------------------------------------------------------------------

function parseReplicaConfigs(): Required<ReplicaConfig>[] {
  const urls = (process.env.DATABASE_REPLICA_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (config.DATABASE_REPLICA_URL && !urls.includes(config.DATABASE_REPLICA_URL)) {
    urls.push(config.DATABASE_REPLICA_URL);
  }

  if (!urls.length) return [];

  const weights = (process.env.DATABASE_REPLICA_WEIGHTS ?? '')
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));

  return urls.map((url, i) => ({
    url,
    weight: weights[i] ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// Read/Write splitting middleware
//
// Attaches to the primary PrismaClient via $use().
// Read actions are transparently forwarded to a replica client.
// Write actions pass through to the primary as normal.
//
// Replication lag consideration:
//   After a write, callers that need immediate read-your-writes consistency
//   should pass `__primaryRead: true` in their query args, e.g.:
//     prisma.user.findUnique({ where: { id }, __primaryRead: true } as any)
//   This forces the read to the primary, bypassing replicas.
// ---------------------------------------------------------------------------

export function applyReadWriteSplitting(primary: PrismaClient): void {
  if (!config.DATABASE_REPLICA_URL && !process.env.DATABASE_REPLICA_URLS) {
    logger.info('Read/write splitting skipped — no DATABASE_REPLICA_URL configured');
    return;
  }

  const replicas = parseReplicaConfigs();

  if (!replicas.length) {
    logger.info('No replicas configured — all queries routed to primary');
    return;
  }

  const primaryUrl = process.env.DATABASE_URL ?? '';
  logger.info('Read/write splitting enabled', {
    replicaCount: replicas.length,
    replicas: replicas.map((r) => ({
      url: redactUrl(r.url),
      weight: r.weight,
    })),
  });

  primary.$use(
    async (
      params: Prisma.MiddlewareParams,
      next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
    ) => {
      // Allow callers to force primary for read-your-writes consistency
      const forcePrimary = (params.args as Record<string, unknown>)?.__primaryRead === true;
      if (forcePrimary && params.args) {
        delete (params.args as Record<string, unknown>).__primaryRead;
      }

      if (!forcePrimary && READ_ACTIONS.has(params.action)) {
        const replicaUrl = pickReplica(replicas, primaryUrl);
        const replicaClient = getReplicaClient(replicaUrl);

        try {
          // Execute the read on the chosen replica
          return await (replicaClient as any)[
            params.model!.charAt(0).toLowerCase() + params.model!.slice(1)
          ][params.action](params.args);
        } catch (err) {
          // Fallback to primary on replica failure
          logger.warn('Replica query failed, falling back to primary', {
            model: params.model,
            action: params.action,
            error: (err as Error).message,
          });
          return next(params);
        }
      }

      // Writes always go to primary
      return next(params);
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Redact password from a connection string for safe logging */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[invalid url]';
  }
}

/** Gracefully disconnect all replica clients (call on app shutdown) */
export async function disconnectReplicas(): Promise<void> {
  await Promise.all(Array.from(replicaPool.values()).map((c) => c.$disconnect()));
  replicaPool.clear();
  logger.info('Replica connections closed');
}
