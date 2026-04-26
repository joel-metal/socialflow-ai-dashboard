/**
 * Call this once at app startup to configure the API client.
 *
 * Example:
 *   configureApi({
 *     baseUrl: import.meta.env.VITE_API_URL,
 *     getToken: () => localStorage.getItem('accessToken') ?? undefined,
 *   });
 */
import { OpenAPI } from './core/OpenAPI';

export function configureApi(options: {
  baseUrl?: string;
  getToken?: () => string | undefined;
}) {
  if (options.baseUrl) {
    OpenAPI.BASE = options.baseUrl;
  }
  if (options.getToken) {
    OpenAPI.TOKEN = async () => options.getToken?.() ?? '';
  }
}
