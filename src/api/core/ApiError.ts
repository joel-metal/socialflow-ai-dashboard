export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}
