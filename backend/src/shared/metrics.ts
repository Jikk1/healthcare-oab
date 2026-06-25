import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { config } from '../config/env.js';

/**
 * Prometheus metrics registry. Exposed at GET /metrics (see health module).
 * RED method: Rate, Errors, Duration on every HTTP request, plus domain
 * counters for risk computations and auth events.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: config.SERVICE_NAME, version: config.SERVICE_VERSION });

if (config.METRICS_ENABLED) {
  collectDefaultMetrics({ register: registry });
}

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const riskComputationsTotal = new Counter({
  name: 'risk_computations_total',
  help: 'Risk assessments computed',
  labelNames: ['model_version', 'level'] as const,
  registers: [registry],
});

export const authEventsTotal = new Counter({
  name: 'auth_events_total',
  help: 'Authentication events',
  labelNames: ['event', 'outcome'] as const,
  registers: [registry],
});

export const omniRiskComputationsTotal = new Counter({
  name: 'omnirisk_computations_total',
  help: 'OmniRisk multi-disease predictions computed',
  labelNames: ['model_version', 'kind'] as const,
  registers: [registry],
});
