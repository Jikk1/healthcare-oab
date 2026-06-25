import type { FastifyInstance } from 'fastify';
import { ok } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { userService } from './user.service.js';
import { ChangeRoleBody, InviteUserBody, UpdateMeBody } from './user.schema.js';

/** Identity & membership management. Admin actions are gated to OWNER/ADMIN. */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  const adminRoles = app.requireRole('OWNER', 'ADMIN');

  app.get('/v1/users/me', { preHandler: app.authenticate }, async (req) => {
    const me = await userService.me(actorFrom(req));
    return ok(me, { requestId: req.correlationId });
  });

  app.patch('/v1/users/me', { preHandler: app.authenticate }, async (req) => {
    const body = UpdateMeBody.parse(req.body);
    const updated = await userService.updateMe(actorFrom(req), body);
    return ok(updated, { requestId: req.correlationId });
  });

  app.get('/v1/users/me/sessions', { preHandler: app.authenticate }, async (req) => {
    const sessions = await userService.listSessions(actorFrom(req));
    return ok(sessions, { requestId: req.correlationId });
  });

  app.delete(
    '/v1/users/me/sessions/:sessionId',
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { sessionId } = req.params as { sessionId: string };
      await userService.revokeSession(actorFrom(req), sessionId);
      reply.status(204);
    },
  );

  // ---- Member administration ----

  app.get('/v1/users', { preHandler: [app.authenticate, adminRoles] }, async (req) => {
    const members = await userService.listMembers(actorFrom(req));
    return ok(members, { requestId: req.correlationId });
  });

  app.post('/v1/users/invite', { preHandler: [app.authenticate, adminRoles] }, async (req, reply) => {
    const body = InviteUserBody.parse(req.body);
    const member = await userService.invite(actorFrom(req), body);
    reply.status(201);
    return ok(member, { requestId: req.correlationId });
  });

  app.patch(
    '/v1/users/:userId/role',
    { preHandler: [app.authenticate, adminRoles] },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const body = ChangeRoleBody.parse(req.body);
      const member = await userService.changeRole(actorFrom(req), userId, body);
      return ok(member, { requestId: req.correlationId });
    },
  );

  app.delete(
    '/v1/users/:userId',
    { preHandler: [app.authenticate, adminRoles] },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      await userService.removeMember(actorFrom(req), userId);
      reply.status(204);
    },
  );
}
