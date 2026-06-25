import { PrismaClient } from '@prisma/client';
import { config, isProd } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Single shared PrismaClient. Connection pooling is delegated to the driver;
 * in production place PgBouncer (transaction pooling) in front for fan-out.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
  log: isProd()
    ? [{ level: 'warn', emit: 'event' }, { level: 'error', emit: 'event' }]
    : [{ level: 'warn', emit: 'event' }, { level: 'error', emit: 'event' }],
});

prisma.$on('warn', (e) => logger.warn({ prisma: e }, 'prisma warning'));
prisma.$on('error', (e) => logger.error({ prisma: e }, 'prisma error'));

export type Db = typeof prisma;
