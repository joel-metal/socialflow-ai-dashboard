import type { ApiRequestOptions } from './ApiRequestOptions';
import { ApiError } from './ApiError';
import type { OpenAPIConfig } from './OpenAPI';

function resolvePath(url: string, path?: Record<string, unknown>): string {
  if (!path) return url;
  return Object.entries(path).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, encodeURIComponent(String(val))),
    url
  );
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `?${params.join('&')}` : '';
}

async function resolveValue<T>(value: T | ((opts: ApiRequestOptions) => Promise<T>), opts: ApiRequestOptions): Promise<T | undefined> {
  if (typeof value === 'function') {
    return (value as (opts: ApiRequestOptions) => Promise<T>)(opts);
  }
  return value;
}

export async function request<T>(config: OpenAPIConfig, opts: ApiRequestOptions): Promise<T> {
  const token = await resolveValue(config.TOKEN, opts);
  const headers: Record<string, string> = {
    'Content-Type': opts.mediaType ?? 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((await resolveValue(config.HEADERS, opts)) ?? {}),
  };

  const url =
    config.BASE +
    resolvePath(opts.url, opts.path) +
    buildQuery(opts.query);

  const response = await fetch(url, {
    method: opts.method,
    headers,
    credentials: config.CREDENTIALS,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => response.statusText);
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
