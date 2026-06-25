import type { Role } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { generateToken, hashPassword, sha256 } from '../../shared/crypto.js';
import { Conflict, Forbidden, NotFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { PLAN_CATALOG } from '../billing/billing.service.js';
import { auditService } from '../audit/audit.service.js';
import { tokenService } from '../auth/token.service.js';
import type { ActorContext } from '../patients/patient.service.js';
import type { ChangeRoleBody, InviteUserBody, UpdateMeBody } from './user.schema.js';

export interface MemberDto {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  joinedAt: Date;
}

function toMemberDto(m: {
  role: Role;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    lastLoginAt: Date | null;
  };
}): MemberDto {
  return {
    userId: m.user.id,
    email: m.user.email,
    fullName: m.user.fullName,
    role: m.role,
    isActive: m.user.isActive,
    lastLoginAt: m.user.lastLoginAt,
    joinedAt: m.createdAt,
  };
}

export const userService = {
  /** Current principal's profile, including the active-tenant role. */
  async me(actor: ActorContext) {
    const user = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw NotFound('User not found');
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.userId,
          organizationId: actor.organizationId,
        },
      },
      include: { organization: true },
    });
    const mfa = await prisma.mfaCredential.findUnique({ where: { userId: actor.userId } });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      mfaEnabled: mfa?.isEnabled ?? false,
      role: membership?.role ?? null,
      organization: membership
        ? {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
          }
        : null,
    };
  },

  async updateMe(actor: ActorContext, body: UpdateMeBody) {
    const user = await prisma.user.update({
      where: { id: actor.userId },
      data: { fullName: body.fullName },
    });
    return { id: user.id, email: user.email, fullName: user.fullName };
  },

  async listMembers(actor: ActorContext): Promise<MemberDto[]> {
    const members = await prisma.membership.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true },
        },
      },
    });
    return members.map(toMemberDto);
  },

  /**
   * Invites a user into the org. If the email is unknown, provisions a user with
   * a random password and emits a password-reset token (the invitee sets their
   * own password). Seat limits are enforced against the active subscription.
   */
  async invite(actor: ActorContext, body: InviteUserBody): Promise<MemberDto> {
    await this.assertSeatAvailable(actor.organizationId);

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: body.email } });
      let isNew = false;
      if (!user) {
        const passwordHash = await hashPassword(generateToken(24));
        user = await tx.user.create({
          data: { email: body.email, fullName: body.fullName, passwordHash },
        });
        isNew = true;
      }

      const existing = await tx.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId: actor.organizationId },
        },
      });
      if (existing) throw Conflict('User is already a member of this organization');

      const membership = await tx.membership.create({
        data: { userId: user.id, organizationId: actor.organizationId, role: body.role },
        include: {
          user: {
            select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true },
          },
        },
      });
      return { membership, user, isNew };
    });

    if (result.isNew) {
      const raw = generateToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: result.user.id,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });
      logger.info(
        { email: body.email, inviteToken: raw },
        'member invited (deliver setup link via email in prod)',
      );
    }

    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'user.invite',
      resourceType: 'user',
      resourceId: result.user.id,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { role: body.role, isNew: result.isNew },
    });

    return toMemberDto(result.membership);
  },

  async changeRole(actor: ActorContext, targetUserId: string, body: ChangeRoleBody) {
    if (targetUserId === actor.userId) {
      throw Forbidden('You cannot change your own role');
    }
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId: actor.organizationId },
      },
    });
    if (!membership) throw NotFound('Member not found');

    // Never allow the last OWNER to be demoted (avoid orphaned org).
    if (membership.role === 'OWNER' && body.role !== 'OWNER') {
      await this.assertNotLastOwner(actor.organizationId);
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { role: body.role },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true },
        },
      },
    });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'user.role_change',
      resourceType: 'user',
      resourceId: targetUserId,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { from: membership.role, to: body.role },
    });
    return toMemberDto(updated);
  },

  async removeMember(actor: ActorContext, targetUserId: string): Promise<void> {
    if (targetUserId === actor.userId) throw Forbidden('You cannot remove yourself');
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: targetUserId, organizationId: actor.organizationId },
      },
    });
    if (!membership) throw NotFound('Member not found');
    if (membership.role === 'OWNER') await this.assertNotLastOwner(actor.organizationId);

    await prisma.membership.delete({ where: { id: membership.id } });
    await tokenService.revokeAll(targetUserId);
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'user.remove',
      resourceType: 'user',
      resourceId: targetUserId,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
  },

  async listSessions(actor: ActorContext) {
    return tokenService.listSessions(actor.userId);
  },

  async revokeSession(actor: ActorContext, sessionId: string): Promise<void> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: actor.userId },
    });
    if (!session) throw NotFound('Session not found');
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  },

  async assertSeatAvailable(organizationId: string): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { organizationId } });
    const limit = sub?.seatLimit ?? PLAN_CATALOG[sub?.plan ?? 'TRIAL'].seatLimit;
    if (limit === null || limit === undefined) return;
    const seats = await prisma.membership.count({ where: { organizationId } });
    if (seats >= limit) {
      throw Forbidden(`Seat limit reached: ${seats}/${limit}. Upgrade your plan to add members.`);
    }
  },

  async assertNotLastOwner(organizationId: string): Promise<void> {
    const owners = await prisma.membership.count({
      where: { organizationId, role: 'OWNER' },
    });
    if (owners <= 1) throw Forbidden('Organization must retain at least one owner');
  },
};
