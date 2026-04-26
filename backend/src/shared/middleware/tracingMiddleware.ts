/**
 * tracingMiddleware.ts
 *
 * Express middleware that:
 *  1. Creates a root server span for every incoming HTTP request.
 *  2. Attaches trace/span IDs to the response headers (X-Trace-Id, X-Span-Id)
 *     so clients and logs can correlate requests end-to-end.
 *  3. Records HTTP status and marks the span as error on 5xx responses.
 */

import { Request, Response, NextFunction } from 'express';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('socialflow-http');

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const spanName = `${req.method} ${req.path}`;

  const span = tracer.startSpan(spanName, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.route': req.path,
      'http.user_agent': req.headers['user-agent'] ?? '',
    },
  });

  // Expose trace context to downstream code via OTel context
  const ctx = trace.setSpan(context.active(), span);

  // Attach IDs to response headers for client-side correlation
  const spanContext = span.spanContext();
  res.setHeader('X-Trace-Id', spanContext.traceId);
  res.setHeader('X-Span-Id', spanContext.spanId);

  // Finish span when response is sent
  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);

    if (res.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
  });

  context.with(ctx, () => next());
}
