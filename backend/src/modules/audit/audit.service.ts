import { prisma } from '../../shared/prisma.js';
import { sha256 } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';

/**
 * Tamper-evident audit trail. Each entry hashes the previous entry's hash plus
 * a canonical serialization of the event, forming a chain: altering any past
 * record breaks verification downstream. Mandatory for healthcare (who accessed
 * which PHI, when). Writes are best-effort and never block the request path.
 */
export interface AuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

function canonical(input: AuditInput, createdAt: string): string {
  return JSON.stringify({
    o: input.organizationId ?? null,
    a: input.actorUserId ?? null,
    act: input.action,
    rt: input.resourceType ?? null,
    ri: input.resourceId ?? null,
    m: input.metadata ?? null,
    t: createdAt,
  });
}

export const auditService = {
  async record(input: AuditInput): Promise<void> {
    try {
      const prev = await prisma.auditLog.findFirst({
        where: { organizationId: input.organizationId ?? null },
        orderBy: { createdAt: 'desc' },
        select: { entryHash: true },
      });
      const createdAt = new Date().toISOString();
      const prevHash = prev?.entryHash ?? null;
      const entryHash = sha256(`${prevHash ?? ''}|${canonical(input, createdAt)}`);

      await prisma.auditLog.create({
        data: {
          organizationId: input.organizationId ?? null,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: (input.metadata ?? undefined) as object | undefined,
          prevHash,
          entryHash,
          // Persist the exact timestamp that was hashed so verifyChain() is reproducible.
          createdAt: new Date(createdAt),
        },
      });
    } catch (err) {
      // Auditing must not break the user flow, but a failure is itself notable.
      logger.error({ err, action: input.action }, 'failed to write audit log');
    }
  },

  /** Verifies the hash chain for an org. Returns the first broken entry id, if any. */
  async verifyChain(organizationId: string): Promise<{ ok: boolean; brokenAt?: string }> {
    const entries = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    let prevHash: string | null = null;
    for (const e of entries) {
      const expected = sha256(
        `${prevHash ?? ''}|${canonical(
          {
            organizationId: e.organizationId,
            actorUserId: e.actorUserId,
            action: e.action,
            resourceType: e.resourceType ?? undefined,
            resourceId: e.resourceId ?? undefined,
            metadata: (e.metadata as Record<string, unknown>) ?? undefined,
          },
          e.createdAt.toISOString(),
        )}`,
      );
      if (expected !== e.entryHash) return { ok: false, brokenAt: e.id };
      prevHash = e.entryHash;
    }
    return { ok: true };
  },
};
