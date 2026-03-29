import { MeiliSearch } from 'meilisearch';
import { config } from '../config/config';

let _client: MeiliSearch | null = null;

export function getMeiliClient(): MeiliSearch {
  if (!_client) {
    _client = new MeiliSearch({
      host: config.MEILISEARCH_HOST,
      apiKey: config.MEILISEARCH_ADMIN_KEY,
    });
  }
  return _client;
}
