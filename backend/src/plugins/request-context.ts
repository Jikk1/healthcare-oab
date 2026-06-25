import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { httpRequestDuration, httpRequestsTotal } from '../shared/metrics.js';

/**
 * Assigns a correlation id (honours inbound X-Request-Id / traceparent),
 * exposes it on the response, binds it to the request logger, and records
 * RED metrics per route.
 */
export const requestContextPlugin = fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const incoming =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['x-correlation-id'] as string | undefined);
    req.correlationId = incoming ?? randomUUID();
    reply.header('x-request-id', req.correlationId);
    req.log = req.log.child({ correlationId: req.correlationId });
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    const labels = {
      method: req.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, reply.elapsedTime / 1000);
  });
});
