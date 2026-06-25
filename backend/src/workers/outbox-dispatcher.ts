import { prisma } from '../shared/prisma.js';
import { logger } from '../shared/logger.js';
import { config } from '../config/env.js';

/**
 * Transactional-outbox relay. Domain writes persist an OutboxEvent in the same
 * DB transaction as the state change; this loop drains PENDING events and
 * "publishes" them (here: structured log — swap for Kafka/SNS/webhook in prod),
 * giving at-least-once delivery with no dual-write inconsistency.
 */
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function publish(event: { type: string; aggregate: string; payload: unknown }): Promise<void> {
  // Integration point: emit to the event bus / webhook fan-out.
  logger.info({ type: event.type, aggregate: event.aggregate }, 'outbox event published');
}

export async function drainOutboxOnce(): Promise<number> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  let published = 0;
  for (const event of events) {
    try {
      await publish(event);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), attempts: { increment: 1 } },
      });
      published += 1;
    } catch (err) {
      const attempts = event.attempts + 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        },
      });
      logger.error({ err, eventId: event.id, attempts }, 'outbox publish failed');
    }
  }
  return published;
}

export function startOutboxDispatcher(intervalMs = 5_000): void {
  if (timer) return;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await drainOutboxOnce();
    } catch (err) {
      logger.error({ err }, 'outbox dispatcher tick failed');
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  logger.info({ intervalMs, env: config.NODE_ENV }, 'outbox dispatcher started');
}

export function stopOutboxDispatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
