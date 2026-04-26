const BATCH_SIZE = 1000;

type FindManyFn<T extends { id: string }> = (args: {
  take: number;
  skip: number;
  cursor?: { id: string };
  orderBy: { id: 'asc' };
}) => Promise<T[]>;

/**
 * Yields records in ascending `id` order using cursor-based pagination.
 * Identical ordering/cursor semantics to the original per-method loops.
 */
export async function* paginatedQuery<T extends { id: string }>(
  findMany: FindManyFn<T>,
): AsyncGenerator<T> {
  let cursor: string | undefined;

  while (true) {
    const batch = await findMany({
      take: BATCH_SIZE + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;

    const hasMore = batch.length > BATCH_SIZE;
    if (hasMore) batch.pop();

    yield* batch;

    if (!hasMore) break;
    cursor = batch[batch.length - 1].id;
  }
}
