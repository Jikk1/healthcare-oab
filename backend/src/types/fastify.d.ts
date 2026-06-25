import type { Role } from '@prisma/client';
import type { AccessClaims } from '../shared/jwt.js';

/**
 * Request-scoped augmentations: the authenticated principal and decorators
 * added by plugins. Keeps controllers fully typed.
 */
declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      organizationId: string;
      role: Role;
      claims: AccessClaims;
    };
    correlationId: string;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};
