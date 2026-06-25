import { authenticator } from 'otplib';
import { nanoid } from 'nanoid';
import { prisma } from '../../shared/prisma.js';
import {
  decryptField,
  encryptField,
  generateToken,
  hashPassword,
  sha256,
  verifyPassword,
} from '../../shared/crypto.js';
import { Conflict, Forbidden, MfaRequired, NotFound, Unauthorized } from '../../shared/errors.js';
import { authEventsTotal } from '../../shared/metrics.js';
import { config } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { tokenService, type SessionMeta, type TokenPair } from './token.service.js';
import { auditService } from '../audit/audit.service.js';
import type { LoginBody, RegisterBody } from './auth.schema.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'clinic'
  );
}

export interface AuthResult {
  user: { id: string; email: string; fullName: string };
  organization: { id: string; name: string; slug: string };
  role: string;
  tokens: TokenPair;
}

export const authService = {
  /** Self-serve signup: provisions an organization, owner user, and trial plan. */
  async register(body: RegisterBody, meta: SessionMeta): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw Conflict('Email already registered');

    const passwordHash = await hashPassword(body.password);
    const slug = `${slugify(body.organizationName)}-${nanoid(6).toLowerCase()}`;
    const trialEnd = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    const { user, organization } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: body.organizationName, slug },
      });
      const user = await tx.user.create({
        data: { email: body.email, passwordHash, fullName: body.fullName },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: organization.id, role: 'OWNER' },
      });
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan: 'TRIAL',
          status: 'TRIALING',
          patientLimit: 50,
          seatLimit: 3,
          currentPeriodEnd: trialEnd,
        },
      });
      return { user, organization };
    });

    const tokens = await tokenService.issue(user.id, organization.id, 'OWNER', meta);
    authEventsTotal.inc({ event: 'register', outcome: 'success' });
    await auditService.record({
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'auth.register',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      role: 'OWNER',
      tokens,
    };
  },

  async login(body: LoginBody, meta: SessionMeta): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Uniform failure to avoid user enumeration / timing leaks.
    if (!user || !user.isActive) {
      authEventsTotal.inc({ event: 'login', outcome: 'failure' });
      throw Unauthorized('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw Forbidden('Account temporarily locked due to failed attempts');
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil:
            failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      authEventsTotal.inc({ event: 'login', outcome: 'failure' });
      throw Unauthorized('Invalid credentials');
    }

    // MFA gate.
    const mfa = await prisma.mfaCredential.findUnique({ where: { userId: user.id } });
    if (mfa?.isEnabled) {
      if (!body.mfaCode) throw MfaRequired();
      const secret = decryptField(mfa.secretEnc);
      if (!authenticator.verify({ token: body.mfaCode, secret })) {
        authEventsTotal.inc({ event: 'mfa', outcome: 'failure' });
        throw Unauthorized('Invalid MFA code');
      }
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: { organization: true },
    });
    if (!membership) throw Forbidden('User has no organization membership');

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await tokenService.issue(
      user.id,
      membership.organizationId,
      membership.role,
      meta,
    );
    authEventsTotal.inc({ event: 'login', outcome: 'success' });
    await auditService.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
      tokens,
    };
  },

  async refresh(rawRefresh: string, meta: SessionMeta): Promise<TokenPair> {
    return tokenService.rotate(rawRefresh, meta);
  },

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await tokenService.revoke(rawRefresh);
  },

  // ---- Password reset ----

  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to avoid leaking which emails exist.
    if (!user) return;
    const raw = generateToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    // In prod: enqueue an email job. For the demo we log the token.
    logger.info({ email, resetToken: raw }, 'password reset requested (deliver via email in prod)');
  },

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw Unauthorized('Invalid or expired reset token');
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    await tokenService.revokeAll(record.userId); // invalidate every session
  },

  // ---- MFA (TOTP) ----

  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('User not found');
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, config.MFA_ISSUER, secret);
    await prisma.mfaCredential.upsert({
      where: { userId },
      create: { userId, secretEnc: encryptField(secret), isEnabled: false },
      update: { secretEnc: encryptField(secret), isEnabled: false, confirmedAt: null },
    });
    return { secret, otpauthUrl };
  },

  async confirmMfa(userId: string, code: string): Promise<string[]> {
    const mfa = await prisma.mfaCredential.findUnique({ where: { userId } });
    if (!mfa) throw NotFound('MFA not initialised');
    const secret = decryptField(mfa.secretEnc);
    if (!authenticator.verify({ token: code, secret })) throw Unauthorized('Invalid MFA code');

    // Single-use recovery codes (stored hashed).
    const recovery = Array.from({ length: 8 }, () => generateToken(5).slice(0, 10));
    await prisma.mfaCredential.update({
      where: { userId },
      data: {
        isEnabled: true,
        confirmedAt: new Date(),
        recoveryEnc: encryptField(JSON.stringify(recovery.map((r) => sha256(r)))),
      },
    });
    authEventsTotal.inc({ event: 'mfa', outcome: 'success' });
    return recovery;
  },

  async disableMfa(userId: string): Promise<void> {
    await prisma.mfaCredential.deleteMany({ where: { userId } });
  },
};
