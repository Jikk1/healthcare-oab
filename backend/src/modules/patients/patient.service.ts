import { customAlphabet } from 'nanoid';
import { NotFound } from '../../shared/errors.js';
import { paginate, page, type Page } from '../../shared/http.js';
import { patientRepository, toDto, type PatientDto } from './patient.repository.js';
import { billingService } from '../billing/billing.service.js';
import { auditService } from '../audit/audit.service.js';
import type { CreatePatientBody, ListPatientsQuery, UpdatePatientBody } from './patient.schema.js';

const mrnDigits = customAlphabet('0123456789', 5);

export interface ActorContext {
  organizationId: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}

export const patientService = {
  async create(actor: ActorContext, body: CreatePatientBody): Promise<PatientDto> {
    await billingService.assertCanAddPatients(actor.organizationId, 1);
    const mrn = body.mrn ?? `P-${mrnDigits()}`;
    const created = await patientRepository.create(actor.organizationId, {
      mrn,
      firstName: body.firstName,
      lastName: body.lastName,
      sex: body.sex,
      ageYears: body.ageYears,
      birthDate: body.birthDate,
    });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'patient.create',
      resourceType: 'patient',
      resourceId: created.id,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { mrn },
    });
    return toDto(created);
  },

  async get(actor: ActorContext, id: string): Promise<PatientDto> {
    const p = await patientRepository.findById(actor.organizationId, id);
    if (!p) throw NotFound('Patient not found');
    // Reading PHI is an auditable event.
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'patient.read',
      resourceType: 'patient',
      resourceId: id,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
    return toDto(p);
  },

  async list(actor: ActorContext, query: ListPatientsQuery): Promise<Page<PatientDto>> {
    const { skip, take } = paginate({ page: query.page, pageSize: query.pageSize });
    const { rows, total } = await patientRepository.list(actor.organizationId, {
      skip,
      take,
      level: query.level,
      archived: query.archived,
      search: query.search,
    });
    return page(rows.map(toDto), total, query.page, query.pageSize);
  },

  async update(actor: ActorContext, id: string, body: UpdatePatientBody): Promise<PatientDto> {
    const existing = await patientRepository.findById(actor.organizationId, id);
    if (!existing) throw NotFound('Patient not found');
    const { encryptField } = await import('../../shared/crypto.js');
    await patientRepository.update(actor.organizationId, id, {
      ...(body.firstName ? { firstNameEnc: encryptField(body.firstName) } : {}),
      ...(body.lastName ? { lastNameEnc: encryptField(body.lastName) } : {}),
      ...(body.sex ? { sex: body.sex } : {}),
      ...(body.ageYears !== undefined ? { ageYears: body.ageYears } : {}),
    });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'patient.update',
      resourceType: 'patient',
      resourceId: id,
    });
    const updated = await patientRepository.findById(actor.organizationId, id);
    return toDto(updated!);
  },

  async archive(actor: ActorContext, id: string): Promise<void> {
    const res = await patientRepository.archive(actor.organizationId, id);
    if (res.count === 0) throw NotFound('Patient not found');
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'patient.archive',
      resourceType: 'patient',
      resourceId: id,
    });
  },
};
