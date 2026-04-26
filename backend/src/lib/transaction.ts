import { prisma } from '../lib/prisma';

/**
 * The transactional Prisma client passed into the callback.
 * Use this instead of the global `prisma` inside the callback so all
 * operations participate in the same transaction.
 */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Wraps a callback in a Prisma interactive transaction.
 * All operations performed via the `tx` argument are atomic —
 * any thrown error rolls back the entire transaction.
 *
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const org = await tx.organization.create({ data: orgData });
 *   const member = await tx.organizationMember.create({
 *     data: { organizationId: org.id, userId, role: 'owner' },
 *   });
 *   return { org, member };
 * });
 */
export async function withTransaction<T>(
  callback: (tx: TxClient) => Promise<T>,
  options?: Parameters<typeof prisma.$transaction>[1],
): Promise<T> {
  return prisma.$transaction(callback, options);
}
