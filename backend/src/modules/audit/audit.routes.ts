import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { ok, page, paginate, PaginationQuery } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { auditService } from './audit.service.js';

/** Audit trail access. Restricted to OWNER/ADMIN — it exposes PHI-access records. */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const adminRoles = app.requireRole('OWNER', 'ADMIN');

  app.get('/v1/audit/logs', { preHandler: [app.authenticate, adminRoles] }, async (req) => {
    const q = PaginationQuery.parse(req.query);
    const { skip, take } = paginate(q);
    const where = { organizationId: actorFrom(req).organizationId };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);
    return ok(page(items, total, q.page, q.pageSize), { requestId: req.correlationId });
  });

  app.get('/v1/audit/verify', { preHandler: [app.authenticate, adminRoles] }, async (req) => {
    const result = await auditService.verifyChain(actorFrom(req).organizationId);
    return ok(result, { requestId: req.correlationId });
  });
}
