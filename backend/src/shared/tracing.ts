import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let sdk: NodeSDK | null = null;

/**
 * OpenTelemetry must initialise before any instrumented library is imported,
 * so main.ts calls this first. No-op unless OTEL_ENABLED=true.
 */
export function startTracing(): void {
  if (!config.OTEL_ENABLED) return;
  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: config.SERVICE_NAME,
      [SEMRESATTRS_SERVICE_VERSION]: config.SERVICE_VERSION,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  logger.info('OpenTelemetry tracing started');
}

export async function stopTracing(): Promise<void> {
  if (sdk) await sdk.shutdown();
}
