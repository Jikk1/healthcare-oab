import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Redis powers: refresh-token denylist, rate limiting, distributed cache (L2),
 * and ephemeral MFA/login challenges. Lazy-connect so unit tests that never
 * touch Redis don't require a live server.
 */
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on('error', (err) => logger.error({ err }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}
