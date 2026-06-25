import type { Patient, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { decryptField, encryptField, encryptNullable } from '../../shared/crypto.js';

/**
 * Tenant-scoped data access for patients. EVERY method takes organizationId and
 * filters on it — no query can cross a tenant boundary. PHI columns are
 * encrypted on write and decrypted only when assembling a DTO.
 */
export interface PatientDto {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  sex: Patient['sex'];
  ageYears: number;
  latestRiskLevel: Patient['latestRiskLevel'];
  latestCvRisk: number | null;
  latestDmRisk: number | null;
  latestBioAge: number | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function initialsOf(first: string, last: string): string {
  return `${last.charAt(0)}${first.charAt(0)}`.toUpperCase();
}

export function toDto(p: Patient): PatientDto {
  const firstName = decryptField(p.firstNameEnc);
  const lastName = decryptField(p.lastNameEnc);
  return {
    id: p.id,
    mrn: p.mrn,
    firstName,
    lastName,
    fullName: `${lastName} ${firstName}`,
    initials: initialsOf(firstName, lastName),
    sex: p.sex,
    ageYears: p.ageYears,
    latestRiskLevel: p.latestRiskLevel,
    latestCvRisk: p.latestCvRisk,
    latestDmRisk: p.latestDmRisk,
    latestBioAge: p.latestBioAge,
    isArchived: p.isArchived,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const patientRepository = {
  async create(
    organizationId: string,
    input: {
      mrn: string;
      firstName: string;
      lastName: string;
      sex: Patient['sex'];
      ageYears: number;
      birthDate?: string;
    },
  ): Promise<Patient> {
    return prisma.patient.create({
      data: {
        organizationId,
        mrn: input.mrn,
        firstNameEnc: encryptField(input.firstName),
        lastNameEnc: encryptField(input.lastName),
        birthDateEnc: encryptNullable(input.birthDate),
        sex: input.sex,
        ageYears: input.ageYears,
      },
    });
  },

  findById(organizationId: string, id: string): Promise<Patient | null> {
    return prisma.patient.findFirst({ where: { id, organizationId } });
  },

  async list(
    organizationId: string,
    opts: {
      skip: number;
      take: number;
      level?: Patient['latestRiskLevel'];
      archived: boolean;
      search?: string;
    },
  ): Promise<{ rows: Patient[]; total: number }> {
    const where: Prisma.PatientWhereInput = {
      organizationId,
      isArchived: opts.archived,
      ...(opts.level ? { latestRiskLevel: opts.level } : {}),
      // MRN is plaintext (non-identifying code) so it is searchable directly.
      // Name search over encrypted columns is intentionally unsupported here;
      // production uses a blind-index / deterministic HMAC column for that.
      ...(opts.search ? { mrn: { contains: opts.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: [{ latestCvRisk: 'desc' }, { createdAt: 'desc' }],
        skip: opts.skip,
        take: opts.take,
      }),
      prisma.patient.count({ where }),
    ]);
    return { rows, total };
  },

  countActive(organizationId: string): Promise<number> {
    return prisma.patient.count({ where: { organizationId, isArchived: false } });
  },

  update(
    organizationId: string,
    id: string,
    data: Prisma.PatientUpdateInput,
  ): Promise<Prisma.BatchPayload> {
    return prisma.patient.updateMany({ where: { id, organizationId }, data });
  },

  archive(organizationId: string, id: string): Promise<Prisma.BatchPayload> {
    return prisma.patient.updateMany({
      where: { id, organizationId },
      data: { isArchived: true },
    });
  },
};
