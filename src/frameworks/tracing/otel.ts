import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { PrismaInstrumentation } from '@prisma/instrumentation';

let sdk: NodeSDK | undefined;

/**
 * Starts the SDK when a collector is configured. Without
 * OTEL_EXPORTER_OTLP_ENDPOINT it stays off, and the context middleware mints
 * its own identifiers.
 */
export function startTracing(): NodeSDK | undefined {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || sdk) return sdk;

  sdk = new NodeSDK({
    // The same three attributes the logger emits, so log, metric and trace
    // name the same service.
    resource: new Resource({
      'service.name': process.env.OTEL_SERVICE_NAME ?? 'billing-service',
      'service.version': process.env.SERVICE_VERSION ?? '0.0.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    // Prisma needs its own instrumentation: it talks to its own query engine
    // rather than the pg driver, so auto-instrumentation yields no query spans.
    instrumentations: [getNodeAutoInstrumentations(), new PrismaInstrumentation()],
  });

  sdk.start();
  process.on('SIGTERM', () => void sdk?.shutdown());
  return sdk;
}
