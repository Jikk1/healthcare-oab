import type { Role } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { redis } from '../../shared/redis.js';
import { generateToken, sha256 } from '../../shared/crypto.js';
import { signAccessToken } from '../../shared/jwt.js';
import { config } from '../../config/env.js';
import { Unauthorized } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { nanoid } from 'nanoid';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresAt: Date;
}

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
  deviceLabel?: string;
}

async function mintAccess(userId: string, organizationId: string, role: Role): Promise<string> {
  return signAccessToken({ userId, organizationId, role });
}

export const tokenService = {
  /** Issues a fresh access+refresh pair and persists the refresh session. */
  async issue(
    userId: string,
    organizationId: string,
    role: Role,
    meta: SessionMeta,
    family = nanoid(),
  ): Promise<TokenPair> {
    const refreshToken = generateToken(48);
    const refreshExpiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);
    await prisma.session.create({
      data: {
        userId,
        organizationId,
        refreshTokenHash: sha256(refreshToken),
        family,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        deviceLabel: meta.deviceLabel,
        expiresAt: refreshExpiresAt,
      },
    });
    return {
      accessToken: await mintAccess(userId, organizationId, role),
      refreshToken,
      accessExpiresIn: config.JWT_ACCESS_TTL,
      refreshExpiresAt,
    };
  },

  /**
   * Rotating refresh with reuse detection. A presented refresh token is single
   * use: on success the old session is revoked and a new one issued in the same
   * family. If an already-revoked token is presented, that is a theft signal —
   * the entire family is revoked.
   */
  async rotate(rawRefresh: string, meta: SessionMeta): Promise<TokenPair> {
    const hash = sha256(rawRefresh);
    const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) throw Unauthorized('Invalid refresh token');

    if (session.revokedAt) {
      // Reuse of a rotated token → revoke the whole family.
      await prisma.session.updateMany({
        where: { family: session.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn({ userId: session.userId, family: session.family }, 'refresh token reuse detected');
      throw Unauthorized('Refresh token reuse detected — all sessions revoked');
    }

    if (session.expiresAt < new Date()) {
      throw Unauthorized('Refresh token expired');
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: session.userId,
          organizationId: session.organizationId,
        },
      },
    });
    if (!membership) throw Unauthorized('Membership no longer valid');

    // Revoke old, issue new in the same family.
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    return this.issue(session.userId, session.organizationId, membership.role, meta, session.family);
  },

  /** Revoke a single session (one device). */
  async revoke(rawRefresh: string): Promise<void> {
    const hash = sha256(rawRefresh);
    await prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Revoke every session for a user and set a global access-token denylist. */
  async revokeAll(userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Access tokens are stateless; deny any issued at/before now until they expire.
    const nowSec = Math.floor(Date.now() / 1000);
    await redis
      .set(`denylist:user:${userId}`, String(nowSec), 'EX', config.JWT_ACCESS_TTL)
      .catch(() => undefined);
  },

  async listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  },
};
