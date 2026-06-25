import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { redis } from '../../shared/redis.js';
import { registry } from '../../shared/metrics.js';
import { config } from '../../config/env.js';

/**
 * Operational endpoints (unauthenticated, excluded from rate limiting):
 *  - /health/live   : process is up (Kubernetes liveness)
 *  - /health/ready  : dependencies reachable (Kubernetes readiness)
 *  - /metrics       : Prometheus scrape target
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    uptime: Math.floor(process.uptime()),
  }));

  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    const checks = { database: false, redis: false };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
    try {
      const pong = await redis.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    }
    const healthy = checks.database && checks.redis;
    reply.status(healthy ? 200 : 503);
    return { status: healthy ? 'ready' : 'degraded', checks };
  });

  app.get('/metrics', { config: { rateLimit: false } }, async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
