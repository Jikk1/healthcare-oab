import fp from 'fastify-plugin';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../shared/jwt.js';
import { Forbidden, Unauthorized } from '../shared/errors.js';
import { redis } from '../shared/redis.js';

/**
 * Decorates the app with `authenticate` (verifies the bearer token, checks the
 * token-version denylist for global logout, attaches the principal) and
 * `requireRole` (RBAC guard). ABAC/tenant-scoping is enforced per-repository.
 */
export const authPlugin = fp(async (app) => {
  app.decorateRequest('auth', undefined);

  app.decorate('authenticate', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Unauthorized('Missing bearer token');
    const token = header.slice(7);
    const claims = await verifyAccessToken(token);

    // Global session kill-switch: a user can be force-logged-out everywhere.
    const denied = await redis.get(`denylist:user:${claims.sub}`).catch(() => null);
    if (denied && claims.iat && Number(denied) > claims.iat) {
      throw Unauthorized('Session revoked');
    }

    req.auth = {
      userId: claims.sub,
      organizationId: claims.org,
      role: claims.role as Role,
      claims,
    };
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: Parameters<typeof app.authenticate>[0]) => {
      if (!req.auth) throw Unauthorized();
      if (!roles.includes(req.auth.role)) {
        throw Forbidden(`Requires one of: ${roles.join(', ')}`);
      }
    };
  });
});
