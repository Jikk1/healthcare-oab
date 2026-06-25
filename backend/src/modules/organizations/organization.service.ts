import { prisma } from '../../shared/prisma.js';
import { NotFound } from '../../shared/errors.js';
import { auditService } from '../audit/audit.service.js';
import { PLAN_CATALOG } from '../billing/billing.service.js';
import type { ActorContext } from '../patients/patient.service.js';
import type { UpdateOrganizationBody } from './organization.schema.js';

export const organizationService = {
  /** Current tenant profile with subscription summary and live usage counters. */
  async current(actor: ActorContext) {
    const org = await prisma.organization.findUnique({
      where: { id: actor.organizationId },
      include: { subscription: true },
    });
    if (!org) throw NotFound('Organization not found');

    const [patientCount, seatCount] = await Promise.all([
      prisma.patient.count({ where: { organizationId: org.id, isArchived: false } }),
      prisma.membership.count({ where: { organizationId: org.id } }),
    ]);

    const plan = org.subscription?.plan ?? 'TRIAL';
    const def = PLAN_CATALOG[plan];

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      country: org.country,
      timezone: org.timezone,
      createdAt: org.createdAt,
      subscription: org.subscription
        ? {
            plan: org.subscription.plan,
            status: org.subscription.status,
            patientLimit: org.subscription.patientLimit ?? def.patientLimit,
            seatLimit: org.subscription.seatLimit ?? def.seatLimit,
            currentPeriodEnd: org.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: org.subscription.cancelAtPeriodEnd,
          }
        : null,
      usage: {
        patients: patientCount,
        seats: seatCount,
      },
    };
  },

  async update(actor: ActorContext, body: UpdateOrganizationBody) {
    const org = await prisma.organization.update({
      where: { id: actor.organizationId },
      data: {
        name: body.name,
        country: body.country,
        timezone: body.timezone,
      },
    });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'organization.update',
      resourceType: 'organization',
      resourceId: org.id,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { ...body },
    });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      country: org.country,
      timezone: org.timezone,
    };
  },
};
