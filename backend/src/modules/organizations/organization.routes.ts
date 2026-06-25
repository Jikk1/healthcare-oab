import type { FastifyInstance } from 'fastify';
import { ok } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { organizationService } from './organization.service.js';
import { UpdateOrganizationBody } from './organization.schema.js';

/** Tenant settings. Reads are open to members; writes require OWNER/ADMIN. */
export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  const adminRoles = app.requireRole('OWNER', 'ADMIN');

  app.get('/v1/organizations/current', { preHandler: app.authenticate }, async (req) => {
    const org = await organizationService.current(actorFrom(req));
    return ok(org, { requestId: req.correlationId });
  });

  app.patch(
    '/v1/organizations/current',
    { preHandler: [app.authenticate, adminRoles] },
    async (req) => {
      const body = UpdateOrganizationBody.parse(req.body);
      const org = await organizationService.update(actorFrom(req), body);
      return ok(org, { requestId: req.correlationId });
    },
  );
}
