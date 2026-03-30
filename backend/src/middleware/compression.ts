import compression, { CompressionOptions } from 'compression';
import { Request, Response } from 'express';
import zlib from 'zlib';

/**
 * Minimum response size (bytes) before compression is applied.
 * Default: 1 KB
 */
const COMPRESSION_THRESHOLD = parseInt(process.env.COMPRESSION_THRESHOLD ?? '1024', 10);

/**
 * Configurable MIME allow/deny lists loaded from environment variables.
 *
 * COMPRESSION_ALLOW_TYPES — comma-separated MIME prefixes/patterns to force-allow.
 *   Example: "application/x-ndjson,text/event-stream"
 *
 * COMPRESSION_DENY_TYPES — comma-separated MIME prefixes/patterns to force-deny.
 *   Example: "application/wasm,font/woff2"
 *
 * Deny list is evaluated before allow list.
 */
function parseMimeList(env: string | undefined): RegExp[] {
  if (!env) return [];
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pattern) => new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*'), 'i'));
}

const DENY_LIST = parseMimeList(process.env.COMPRESSION_DENY_TYPES);
const ALLOW_LIST = parseMimeList(process.env.COMPRESSION_ALLOW_TYPES);

/**
 * Built-in deny patterns for content that is already compressed or binary.
 * These are always applied regardless of env config.
 */
const BUILTIN_DENY = [
  // Media — already compressed
  /^(image|video|audio)\//i,
  // Common binary/compressed application types
  /^application\/(zip|gzip|x-gzip|x-bzip2|x-7z-compressed|x-rar-compressed|zstd|octet-stream|pdf|wasm)/i,
  // Font formats that are already compressed
  /^font\/(woff2|woff)/i,
];

/**
 * Determines whether a response should be compressed.
 *
 * Evaluation order:
 *   1. x-no-compression header opt-out
 *   2. Configurable deny list (COMPRESSION_DENY_TYPES)
 *   3. Built-in deny list (images, video, binary, etc.)
 *   4. Configurable allow list (COMPRESSION_ALLOW_TYPES) — overrides built-in deny
 *   5. compression.filter default heuristic
 */
function shouldCompress(req: Request, res: Response): boolean {
  // Respect the caller's explicit opt-out
  if (req.headers['x-no-compression']) return false;

  const contentType = (res.getHeader('Content-Type') as string | undefined) ?? '';

  // Configurable deny list takes highest priority
  if (DENY_LIST.some((re) => re.test(contentType))) return false;

  // Built-in deny for already-compressed / binary content
  if (BUILTIN_DENY.some((re) => re.test(contentType))) {
    // Allow list can override built-in deny (e.g. force-compress a specific subtype)
    if (ALLOW_LIST.length > 0 && ALLOW_LIST.some((re) => re.test(contentType))) return true;
    return false;
  }

  // Configurable allow list — force-allow edge MIME types not covered by the default filter
  if (ALLOW_LIST.length > 0 && ALLOW_LIST.some((re) => re.test(contentType))) return true;

  // Fall back to the compression package's default heuristic (covers text/*, application/json, etc.)
  return compression.filter(req, res);
}

/**
 * Gzip compression options.
 * The `compression` package negotiates encoding via Accept-Encoding automatically.
 * Brotli is handled natively by Node 18+ when the client sends `Accept-Encoding: br`.
 */
const compressionOptions: CompressionOptions = {
  filter: shouldCompress,
  threshold: COMPRESSION_THRESHOLD,
  level: zlib.constants.Z_DEFAULT_COMPRESSION,
};

/**
 * Express middleware that applies Gzip/Brotli compression to qualifying responses.
 *
 * Configuration via environment variables:
 *   COMPRESSION_THRESHOLD      — min bytes before compressing (default: 1024)
 *   COMPRESSION_ALLOW_TYPES    — comma-separated MIME patterns to force-allow
 *   COMPRESSION_DENY_TYPES     — comma-separated MIME patterns to force-deny
 *
 * Examples:
 *   COMPRESSION_ALLOW_TYPES=application/x-ndjson,text/event-stream
 *   COMPRESSION_DENY_TYPES=application/wasm,font/woff2
 */
export const compressionMiddleware = compression(compressionOptions);
