/**
 * OpenTelemetry distributed tracing initialization.
 * Must be imported at the very top of your application entry point
 * before any other imports that use instrumented libraries:
 *
 *   import './tracing';   // ESM
 *   require('./tracing'); // CJS
 *
 * Exports traces to Jaeger (default) or Honeycomb via OTLP HTTP.
 * Configure via environment variables — see .env.example.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable verbose OTel diagnostics when OTEL_DEBUG=true
if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

/**
 * Build the span exporter based on OTEL_EXPORTER env var.
 *
 * OTEL_EXPORTER=honeycomb  → Honeycomb OTLP HTTP
 * OTEL_EXPORTER=otlp       → Generic OTLP HTTP (Grafana Tempo, Lightstep, etc.)
 * OTEL_EXPORTER=jaeger     → Jaeger (default)
 */
function buildExporter(): OTLPTraceExporter | JaegerExporter {
  const exporterType = process.env.OTEL_EXPORTER ?? 'jaeger';

  if (exporterType === 'honeycomb') {
    return new OTLPTraceExporter({
      url: 'https://api.honeycomb.io/v1/traces',
      headers: {
        'x-honeycomb-team': process.env.HONEYCOMB_API_KEY ?? '',
        'x-honeycomb-dataset':
          process.env.HONEYCOMB_DATASET ?? 'socialflow-ai-dashboard',
      },
    });
  }

  if (exporterType === 'otlp') {
    return new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        'http://localhost:4318/v1/traces',
    });
  }

  // Default: Jaeger
  return new JaegerExporter({
    endpoint:
      process.env.JAEGER_ENDPOINT ?? 'http://localhost:14268/api/traces',
  });
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME ?? 'socialflow-ai-dashboard',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? 'development',
  }),

  // Use SimpleSpanProcessor in development for immediate span visibility;
  // BatchSpanProcessor in all other environments for production-grade buffering.
  spanProcessors: [
    import.meta.env.MODE === 'development'
      ? new SimpleSpanProcessor(buildExporter())
      : new BatchSpanProcessor(buildExporter()),
  ],

  // Auto-instrument critical paths: HTTP, Express, DB clients, AI fetch calls
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-mongodb': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
      '@opentelemetry/instrumentation-undici': { enabled: true },
    }),
  ],
});

// Start SDK — must happen before instrumented libraries are loaded
sdk.start();

// Flush and shut down cleanly on process termination
const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { sdk };
