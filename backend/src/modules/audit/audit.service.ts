import { prisma } from '../../shared/prisma.js';
import { sha256 } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';

/**
 * Tamper-evident audit trail. Each entry hashes the previous entry's hash plus
 * a canonical serialization of the event, forming a chain: altering any past
 * record breaks verification downstream. Mandatory for healthcare (who accessed
 * which PHI, when). Writes are best-effort and never block the request path.
 *
 * Ordering is by the strictly-monotonic `seq` (SERIAL), NOT `createdAt` —
 * millisecond timestamps tie under bursts and would make both the prev-lookup
 * and verifyChain non-deterministic (false tamper alerts). Appends are also
 * serialized per organization with a Postgres advisory lock so the prev-hash
 * read and the insert are atomic under concurrency.
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

/** Minimal shape needed to recompute a chain entry's hash. */
export interface ChainEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  entryHash: string;
  createdAt: Date;
}

/**
 * Recursively sort object keys so serialization is independent of key order.
 * Required because metadata round-trips through Postgres `jsonb`, which does NOT
 * preserve insertion order — without this, an entry written as {riskLevel, overall}
 * reads back as {overall, riskLevel} and the chain hash no longer matches.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    return Object.keys(src)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeysDeep(src[k]);
        return acc;
      }, {});
  }
  return value;
}

/** Canonical, key-order-independent serialization of an audit payload. */
export function canonicalPayload(
  input: Pick<AuditInput, 'organizationId' | 'actorUserId' | 'action' | 'resourceType' | 'resourceId' | 'metadata'>,
  createdAt: string,
): string {
  return JSON.stringify({
    o: input.organizationId ?? null,
    a: input.actorUserId ?? null,
    act: input.action,
    rt: input.resourceType ?? null,
    ri: input.resourceId ?? null,
    m: input.metadata ? sortKeysDeep(input.metadata) : null,
    t: createdAt,
  });
}

/** Hash of one chain entry: sha256(prevHash + '|' + canonical(payload)). Pure. */
export function computeEntryHash(
  prevHash: string | null,
  input: Pick<AuditInput, 'organizationId' | 'actorUserId' | 'action' | 'resourceType' | 'resourceId' | 'metadata'>,
  createdAt: string,
): string {
  return sha256(`${prevHash ?? ''}|${canonicalPayload(input, createdAt)}`);
}

/**
 * Verifies a chain given entries already ordered by `seq` ascending. Pure —
 * unit-tested without a database. Returns the first broken entry id, if any.
 */
export function verifyEntries(entries: ChainEntry[]): { ok: boolean; brokenAt?: string } {
  let prevHash: string | null = null;
  for (const e of entries) {
    const expected = computeEntryHash(
      prevHash,
      {
        organizationId: e.organizationId,
        actorUserId: e.actorUserId,
        action: e.action,
        resourceType: e.resourceType ?? undefined,
        resourceId: e.resourceId ?? undefined,
        metadata: (e.metadata as Record<string, unknown>) ?? undefined,
      },
      e.createdAt.toISOString(),
    );
    if (expected !== e.entryHash) return { ok: false, brokenAt: e.id };
    prevHash = e.entryHash;
  }
  return { ok: true };
}

export const auditService = {
  async record(input: AuditInput): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // Serialize chain appends per organization: the prev-hash read and the
        // insert must be atomic, else concurrent writers chain off the same
        // entry and break the chain. Advisory lock is released at tx end.
        const lockKey = `audit:${input.organizationId ?? 'global'}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const prev = await tx.auditLog.findFirst({
          where: { organizationId: input.organizationId ?? null },
          orderBy: { seq: 'desc' },
          select: { entryHash: true },
        });
        const createdAt = new Date().toISOString();
        const prevHash = prev?.entryHash ?? null;
        const entryHash = computeEntryHash(prevHash, input, createdAt);

        await tx.auditLog.create({
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
      orderBy: { seq: 'asc' },
    });
    return verifyEntries(entries as ChainEntry[]);
  },
};
