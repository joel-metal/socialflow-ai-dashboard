/**
 * traceContext.ts
 *
 * Helpers for serialising and restoring W3C Trace Context across async
 * boundaries (e.g. HTTP request → BullMQ job payload).
 *
 * We use the OpenTelemetry W3C TraceContext propagator so the serialised
 * format is the standard `traceparent` / `tracestate` header pair, which
 * Jaeger, Honeycomb, and any OTLP-compatible backend understand natively.
 */

import {
  context,
  propagation,
  trace,
  Context,
  SpanContext,
  TraceFlags,
} from '@opentelemetry/api';

/** The shape stored inside a job payload. */
export interface SerializedTraceContext {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Capture the active trace context from the current OTel context and return
 * it as a plain object suitable for JSON serialisation into a job payload.
 *
 * Returns `undefined` when there is no active sampled span (so callers can
 * omit the field entirely rather than storing empty strings).
 */
export function captureTraceContext(): SerializedTraceContext | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  // Only propagate if we actually have a traceparent (i.e. an active span)
  if (!carrier['traceparent']) {
    return undefined;
  }

  return {
    traceparent: carrier['traceparent'],
    tracestate: carrier['tracestate'],
  };
}

/**
 * Restore a previously captured trace context and return an OTel `Context`
 * whose active span is a *remote* span representing the originating request.
 *
 * Pass the returned context to `context.with(ctx, fn)` so that any spans
 * created inside `fn` become children of the originating HTTP request span.
 *
 * Returns the current active context unchanged when `serialized` is falsy.
 */
export function restoreTraceContext(
  serialized: SerializedTraceContext | undefined,
): Context {
  if (!serialized?.traceparent) {
    return context.active();
  }

  const carrier: Record<string, string> = {
    traceparent: serialized.traceparent,
    ...(serialized.tracestate ? { tracestate: serialized.tracestate } : {}),
  };

  return propagation.extract(context.active(), carrier);
}
