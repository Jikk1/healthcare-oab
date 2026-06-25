import { startTracing, stopTracing } from './shared/tracing.js';

// Tracing must initialise before any instrumented library loads.
startTracing();

const { config } = await import('./config/env.js');
const { logger } = await import('./shared/logger.js');
const { connectRedis, redis } = await import('./shared/redis.js');
const { prisma } = await import('./shared/prisma.js');
const { buildApp } = await import('./app.js');
const { startOutboxDispatcher, stopOutboxDispatcher } = await import(
  './workers/outbox-dispatcher.js'
);

async function bootstrap(): Promise<void> {
  await connectRedis();

  const app = await buildApp();
  startOutboxDispatcher();

  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info(
    { host: config.HOST, port: config.PORT, env: config.NODE_ENV },
    'HealthCareOAB+ API listening',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'graceful shutdown initiated');
    try {
      stopOutboxDispatcher();
      await app.close();
      await prisma.$disconnect();
      await redis.quit().catch(() => undefined);
      await stopTracing();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  // Logger may not be available if config failed; fall back to console.
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to start server', err);
  process.exit(1);
});
