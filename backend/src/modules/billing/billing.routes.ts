import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { ok } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { auditService } from '../audit/audit.service.js';
import { PLAN_CATALOG, billingService } from './billing.service.js';
import { ChangePlanBody } from './billing.schema.js';

/** Subscription self-service. Plan changes are restricted to OWNER/BILLING. */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const billingRoles = app.requireRole('OWNER', 'BILLING');

  app.get('/v1/billing/plans', { preHandler: app.authenticate }, async (req) => {
    return ok(Object.values(PLAN_CATALOG), { requestId: req.correlationId });
  });

  app.get('/v1/billing/subscription', { preHandler: app.authenticate }, async (req) => {
    const sub = await billingService.getSubscription(actorFrom(req).organizationId);
    return ok(sub, { requestId: req.correlationId });
  });

  app.get('/v1/billing/invoices', { preHandler: app.authenticate }, async (req) => {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: actorFrom(req).organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return ok(invoices, { requestId: req.correlationId });
  });

  app.post(
    '/v1/billing/subscription',
    { preHandler: [app.authenticate, billingRoles] },
    async (req) => {
      const actor = actorFrom(req);
      const body = ChangePlanBody.parse(req.body);
      const updated = await billingService.changePlan(actor.organizationId, body.plan);
      await auditService.record({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'billing.plan_change',
        resourceType: 'subscription',
        resourceId: updated.id,
        ipAddress: actor.ip,
        userAgent: actor.userAgent,
        metadata: { plan: body.plan },
      });
      return ok(updated, { requestId: req.correlationId });
    },
  );
}
