import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../shared/errors.js';

/**
 * Single funnel mapping every thrown error to a stable wire envelope:
 *   { error: { code, message, details? }, meta: { requestId } }
 * 5xx internals are never leaked to clients but always logged with context.
 */
export const errorHandlerPlugin = fp(async (app) => {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` },
      meta: { requestId: req.correlationId },
    });
  });

  app.setErrorHandler((err, req, reply) => {
    const requestId = req.correlationId;

    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, err.message);
      else req.log.warn({ code: err.code }, err.message);
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.expose ? err.message : 'Internal server error',
          details: err.details,
        },
        meta: { requestId },
      });
    }

    if (err instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        meta: { requestId },
      });
    }

    // Fastify schema validation
    if ((err as { validation?: unknown }).validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          details: (err as { validation?: unknown }).validation,
        },
        meta: { requestId },
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'Resource already exists' },
          meta: { requestId },
        });
      }
      if (err.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Resource not found' },
          meta: { requestId },
        });
      }
    }

    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        meta: { requestId },
      });
    }

    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL', message: 'Internal server error' },
      meta: { requestId },
    });
  });
});
