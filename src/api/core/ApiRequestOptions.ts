export type ApiRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  mediaType?: string;
  responseHeader?: string;
  errors?: Record<number, string>;
};
