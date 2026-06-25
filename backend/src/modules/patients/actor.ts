import type { FastifyRequest } from 'fastify';
import { Unauthorized } from '../../shared/errors.js';
import type { ActorContext } from './patient.service.js';

/** Builds the auditable actor context from an authenticated request. */
export function actorFrom(req: FastifyRequest): ActorContext {
  if (!req.auth) throw Unauthorized();
  return {
    organizationId: req.auth.organizationId,
    userId: req.auth.userId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}
