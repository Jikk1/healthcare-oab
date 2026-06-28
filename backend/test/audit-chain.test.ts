import { describe, it, expect } from 'vitest';
import {
  computeEntryHash,
  verifyEntries,
  canonicalPayload,
  type AuditInput,
  type ChainEntry,
} from '../src/modules/audit/audit.service.js';

/** Строит корректную цепочку из входов (как это делает record() по порядку seq). */
function makeChain(inputs: AuditInput[]): ChainEntry[] {
  let prev: string | null = null;
  return inputs.map((inp, i) => {
    const createdAt = new Date(1_700_000_000_000 + i * 1000);
    const entryHash = computeEntryHash(prev, inp, createdAt.toISOString());
    prev = entryHash;
    return {
      id: `e${i}`,
      organizationId: inp.organizationId ?? null,
      actorUserId: inp.actorUserId ?? null,
      action: inp.action,
      resourceType: inp.resourceType ?? null,
      resourceId: inp.resourceId ?? null,
      metadata: inp.metadata ?? null,
      entryHash,
      createdAt,
    };
  });
}

const SAMPLE: AuditInput[] = [
  { organizationId: 'org1', action: 'auth.login', actorUserId: 'u1' },
  { organizationId: 'org1', action: 'patient.create', resourceType: 'patient', resourceId: 'p1', metadata: { mrn: 'P-1' } },
  { organizationId: 'org1', action: 'risk.compute', resourceId: 'p1', metadata: { riskLevel: 'HIGH', overall: 0.4 } },
];

describe('audit chain', () => {
  it('верифицирует неизменённую цепочку', () => {
    expect(verifyEntries(makeChain(SAMPLE))).toEqual({ ok: true });
  });

  it('обнаруживает подмену поля и указывает первую сломанную запись', () => {
    const chain = makeChain(SAMPLE);
    chain[1]!.action = 'patient.delete'; // подделка
    expect(verifyEntries(chain)).toEqual({ ok: false, brokenAt: 'e1' });
  });

  it('обнаруживает подмену metadata', () => {
    const chain = makeChain(SAMPLE);
    chain[2]!.metadata = { riskLevel: 'LOW', overall: 0.1 };
    expect(verifyEntries(chain)).toEqual({ ok: false, brokenAt: 'e2' });
  });

  it('обнаруживает переупорядочивание/удаление записей', () => {
    const chain = makeChain(SAMPLE);
    const reordered = [chain[0]!, chain[2]!, chain[1]!]; // e2 и e1 поменяны местами
    const res = verifyEntries(reordered);
    expect(res.ok).toBe(false);
  });

  it('canonical устойчив к порядку ключей metadata', () => {
    const t = new Date(0).toISOString();
    const a = canonicalPayload({ action: 'x', metadata: { b: 1, a: 2, nested: { y: 1, x: 2 } } }, t);
    const b = canonicalPayload({ action: 'x', metadata: { a: 2, nested: { x: 2, y: 1 }, b: 1 } }, t);
    expect(a).toBe(b);
    expect(computeEntryHash(null, { action: 'x', metadata: { b: 1, a: 2 } }, t)).toBe(
      computeEntryHash(null, { action: 'x', metadata: { a: 2, b: 1 } }, t),
    );
  });

  it('первая запись хешируется с prevHash=null', () => {
    const chain = makeChain([SAMPLE[0]!]);
    const expected = computeEntryHash(null, SAMPLE[0]!, chain[0]!.createdAt.toISOString());
    expect(chain[0]!.entryHash).toBe(expected);
  });
});
