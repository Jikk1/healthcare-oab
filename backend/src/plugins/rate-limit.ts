import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config/env.js';
import { redis } from '../shared/redis.js';

/**
 * Global token-bucket rate limiting backed by Redis (so limits hold across
 * all API replicas). Per-route stricter limits (e.g. login) are applied at
 * the route via `config.rateLimit`. Keyed by authenticated user when present,
 * else by client IP — mitigates credential stuffing and scraping.
 */
export const rateLimitPlugin = fp(async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    redis,
    nameSpace: 'rl:',
    // Fail open: if Redis is unreachable, serve the request unthrottled rather
    // than 500-ing the entire API. Auth + RBAC still guard every endpoint, so a
    // transient store outage degrades throttling, not access control.
    skipOnError: true,
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    errorResponseBuilder: (_req, ctx) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Retry in ${Math.ceil(ctx.ttl / 1000)}s`,
      },
    }),
  });
});
