import type { SubscriptionPlan } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { PlanLimitReached, NotFound } from '../../shared/errors.js';

/**
 * Subscription & metering. Mirrors the landing-page pricing:
 *   BASIC ₽29 000/мес — до 500 пациентов
 *   PRO   ₽79 000/мес — без ограничений
 * Plan limits are enforced server-side at write time (never trust the client).
 */
export interface PlanDefinition {
  plan: SubscriptionPlan;
  monthlyCents: number;
  patientLimit: number | null; // null = unlimited
  seatLimit: number | null;
  features: string[];
}

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanDefinition> = {
  TRIAL: {
    plan: 'TRIAL',
    monthlyCents: 0,
    patientLimit: 50,
    seatLimit: 3,
    features: ['risk-engine', 'dashboard'],
  },
  BASIC: {
    plan: 'BASIC',
    monthlyCents: 2_900_000,
    patientLimit: 500,
    seatLimit: 10,
    features: ['risk-engine', 'dashboard', 'recommendations', 'export'],
  },
  PRO: {
    plan: 'PRO',
    monthlyCents: 7_900_000,
    patientLimit: null,
    seatLimit: 50,
    features: ['risk-engine', 'dashboard', 'recommendations', 'export', 'api', 'population-analytics'],
  },
  ENTERPRISE: {
    plan: 'ENTERPRISE',
    monthlyCents: 0, // custom / contract
    patientLimit: null,
    seatLimit: null,
    features: ['*'],
  },
};

export const billingService = {
  async getSubscription(organizationId: string) {
    const sub = await prisma.subscription.findUnique({ where: { organizationId } });
    if (!sub) throw NotFound('No subscription for organization');
    return { ...sub, definition: PLAN_CATALOG[sub.plan] };
  },

  /** Throws PLAN_LIMIT_REACHED if adding `count` patients would exceed the plan. */
  async assertCanAddPatients(organizationId: string, count = 1): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { organizationId } });
    const limit = sub?.patientLimit ?? PLAN_CATALOG[sub?.plan ?? 'TRIAL'].patientLimit;
    if (limit === null || limit === undefined) return; // unlimited
    const active = await prisma.patient.count({
      where: { organizationId, isArchived: false },
    });
    if (active + count > limit) {
      throw PlanLimitReached(
        `Plan limit reached: ${active}/${limit} patients. Upgrade to add more.`,
      );
    }
  },

  async changePlan(organizationId: string, plan: SubscriptionPlan) {
    const def = PLAN_CATALOG[plan];
    return prisma.subscription.update({
      where: { organizationId },
      data: {
        plan,
        status: plan === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
        patientLimit: def.patientLimit,
        seatLimit: def.seatLimit,
      },
    });
  },
};
