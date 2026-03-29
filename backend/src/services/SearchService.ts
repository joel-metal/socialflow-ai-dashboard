import { getMeiliClient } from '../lib/meilisearch';
import { createLogger } from '../lib/logger';

const logger = createLogger('search-service');

export const POSTS_INDEX = 'posts';

export interface PostDocument {
  id: string;
  organizationId: string;
  content: string;
  platform: string;
  scheduledAt: string | null;
  createdAt: string;
}

/** Ensure the posts index exists with the correct settings. Call once at startup. */
export async function initSearchIndex(): Promise<void> {
  const client = getMeiliClient();
  await client.createIndex(POSTS_INDEX, { primaryKey: 'id' });
  const index = client.index(POSTS_INDEX);
  await index.updateSettings({
    searchableAttributes: ['content', 'platform'],
    filterableAttributes: ['organizationId', 'platform', 'scheduledAt'],
    sortableAttributes: ['createdAt', 'scheduledAt'],
  });
  logger.info('Meilisearch index initialised', { index: POSTS_INDEX });
}

/** Index (upsert) a single post document. */
export async function indexPost(doc: PostDocument): Promise<void> {
  try {
    await getMeiliClient().index(POSTS_INDEX).addDocuments([doc]);
  } catch (err) {
    logger.error('Failed to index post', { id: doc.id, error: (err as Error).message });
  }
}

/** Full-text search across posts with optional filters. */
export async function searchPosts(
  query: string,
  opts: {
    organizationId?: string;
    platform?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const filter: string[] = [];
  if (opts.organizationId) filter.push(`organizationId = "${opts.organizationId}"`);
  if (opts.platform) filter.push(`platform = "${opts.platform}"`);

  return getMeiliClient()
    .index(POSTS_INDEX)
    .search(query, {
      filter: filter.length ? filter : undefined,
      limit: opts.limit ?? 20,
      offset: opts.offset ?? 0,
    });
}
