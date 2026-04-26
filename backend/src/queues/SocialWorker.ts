import { createLogger } from '../lib/logger';
import { RateLimitError } from '../lib/errors';

const logger = createLogger('SocialWorker');

// ── Types ────────────────────────────────────────────────────────────────────

export interface SocialWorkerOptions {
  /** Maximum number of attempts before giving up. Default: 5 */
  maxAttempts?: number;
  /** Fixed fallback backoff in ms when no platform delay is provided. Default: 1000 */
  fallbackBackoffMs?: number;
  /** Cap on any computed delay in ms. Default: 15 minutes */
  maxDelayMs?: number;
}

export interface SocialWorkerJob<T> {
  id: string;
  /** The async function that performs the platform API call and returns a fetch Response */
  execute: () => Promise<Response>;
  /** Transform the successful Response into the desired result type */
  transform: (res: Response) => Promise<T>;
}

export interface SocialWorkerResult<T> {
  jobId: string;
  result?: T;
  error?: Error;
  attempts: number;
}

// ── Retry-After header parsing ───────────────────────────────────────────────

/**
 * Extracts the platform-provided retry delay (in ms) from response headers.
 *
 * Checks, in order:
 *  1. `Retry-After`       — seconds (integer) or HTTP-date
 *  2. `x-rate-limit-reset` — Unix timestamp (seconds) or seconds-delta
 *
 * Returns `null` when no usable header is present.
 */
export function extractRetryDelay(headers: Headers): number | null {
  // 1. Retry-After
  const retryAfter = headers.get('retry-after') ?? headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    // HTTP-date format
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
      const delta = date - Date.now();
      if (delta > 0) return delta;
    }
  }

  // 2. x-rate-limit-reset
  const resetHeader =
    headers.get('x-rate-limit-reset') ??
    headers.get('X-Rate-Limit-Reset') ??
    headers.get('x-ratelimit-reset') ??
    headers.get('X-RateLimit-Reset');

  if (resetHeader) {
    const val = Number(resetHeader);
    if (!isNaN(val)) {
      // Unix timestamp (seconds) — values > 1e9 are epoch timestamps
      if (val > 1e9) {
        const delta = val * 1000 - Date.now();
        if (delta > 0) return delta;
      } else {
        // Treat as seconds-delta
        return val * 1000;
      }
    }
  }

  return null;
}

// ── Worker factory ───────────────────────────────────────────────────────────

/**
 * Creates a social platform worker that executes a job with smart retry logic.
 *
 * On a 429 response the worker reads `Retry-After` / `x-rate-limit-reset`
 * headers and waits the platform-specified duration before retrying.
 * Fixed exponential backoff is only used when no platform delay is provided.
 */
export function createSocialWorker(options: SocialWorkerOptions = {}) {
  const {
    maxAttempts = 5,
    fallbackBackoffMs = 1000,
    maxDelayMs = 15 * 60 * 1000, // 15 minutes
  } = options;

  async function run<T>(job: SocialWorkerJob<T>): Promise<SocialWorkerResult<T>> {
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      logger.info(`[${job.id}] Attempt ${attempt}/${maxAttempts}`);

      let response: Response;
      try {
        response = await job.execute();
      } catch (err) {
        // Network-level error — apply fixed backoff and retry
        const delay = Math.min(fallbackBackoffMs * Math.pow(2, attempt - 1), maxDelayMs);
        logger.warn(`[${job.id}] Network error on attempt ${attempt}, retrying in ${delay}ms`, { err });
        if (attempt < maxAttempts) await sleep(delay);
        continue;
      }

      // ── Success ──────────────────────────────────────────────────────────
      if (response.ok) {
        try {
          const result = await job.transform(response);
          logger.info(`[${job.id}] Completed successfully after ${attempt} attempt(s)`);
          return { jobId: job.id, result, attempts: attempt };
        } catch (err) {
          return { jobId: job.id, error: err as Error, attempts: attempt };
        }
      }

      // ── Rate limited (429) ───────────────────────────────────────────────
      if (response.status === 429) {
        const platformDelay = extractRetryDelay(response.headers);

        if (platformDelay !== null) {
          const capped = Math.min(platformDelay, maxDelayMs);
          logger.warn(
            `[${job.id}] Rate limited (429). Using platform Retry-After delay: ${capped}ms`
          );
          if (attempt < maxAttempts) await sleep(capped);
        } else {
          // No platform hint — fall back to exponential backoff
          const delay = Math.min(fallbackBackoffMs * Math.pow(2, attempt - 1), maxDelayMs);
          logger.warn(
            `[${job.id}] Rate limited (429). No platform delay header, using fallback backoff: ${delay}ms`
          );
          if (attempt < maxAttempts) await sleep(delay);
        }

        if (attempt >= maxAttempts) {
          const retryAfterSec = extractRetryDelay(response.headers);
          return {
            jobId: job.id,
            error: new RateLimitError(
              `[${job.id}] Rate limit exceeded after ${maxAttempts} attempts`,
              retryAfterSec !== null ? Math.ceil(retryAfterSec / 1000) : undefined
            ),
            attempts: attempt,
          };
        }

        continue;
      }

      // ── Other non-retryable error ─────────────────────────────────────────
      const body = await response.text().catch(() => '');
      const error = new Error(
        `[${job.id}] Platform responded with ${response.status}: ${body.slice(0, 200)}`
      );
      logger.error(`[${job.id}] Non-retryable error`, { status: response.status });
      return { jobId: job.id, error, attempts: attempt };
    }

    // Should not reach here, but satisfy TypeScript
    return {
      jobId: job.id,
      error: new Error(`[${job.id}] Exhausted ${maxAttempts} attempts`),
      attempts: attempt,
    };
  }

  return { run };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
