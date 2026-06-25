import { prisma } from '../../shared/prisma.js';
import { NotFound } from '../../shared/errors.js';
import { omniRiskComputationsTotal } from '../../shared/metrics.js';
import { auditService } from '../audit/audit.service.js';
import { patientRepository } from '../patients/patient.repository.js';
import type { ActorContext } from '../patients/patient.service.js';
import type { HealthProfile } from './domain/health-profile.js';
import { runOmniRisk, simulateIntervention, type OmniRiskResult, type InterventionDelta } from './domain/omni-risk-engine.js';
import { MODEL_CARD } from './domain/model-registry.js';
import { requiresGeneticConsent } from './domain/privacy.js';
import type { HealthProfileInput, InterventionInput } from './prediction.schema.js';

/**
 * Сервисный слой универсального прогнозирования. Вычисление чистое и
 * stateless (движок не пишет в БД), но каждое обращение аудируется, а для
 * пациентов из БД профиль собирается из сохранённых биомаркеров.
 */
export const predictionService = {
  /** Прогноз по «свободному» мультимодальному профилю (без привязки к пациенту). */
  async predict(actor: ActorContext, input: HealthProfileInput): Promise<OmniRiskResult> {
    const result = runOmniRisk(input as HealthProfile);
    omniRiskComputationsTotal.inc({ model_version: result.modelVersion, kind: 'profile' });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'omnirisk.predict',
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: {
        healthIndex: result.healthIndex,
        confidence: result.confidence,
        geneticData: requiresGeneticConsent(input as HealthProfile),
      },
    });
    return result;
  },

  /** Контрфактическое моделирование вмешательства над «свободным» профилем. */
  async simulate(actor: ActorContext, input: HealthProfileInput, overrides: InterventionInput['overrides']): Promise<InterventionDelta> {
    const delta = simulateIntervention(input as HealthProfile, overrides as Partial<HealthProfile>);
    omniRiskComputationsTotal.inc({ model_version: delta.baseline.modelVersion, kind: 'intervention' });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'omnirisk.simulate',
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { healthIndexDelta: delta.healthIndexDelta, lifeExpectancyDelta: delta.lifeExpectancyDelta },
    });
    return delta;
  },

  /**
   * Прогноз для существующего пациента: профиль собирается из его
   * демографии и последнего набора биомаркеров (tenant-scoped).
   */
  async predictForPatient(actor: ActorContext, patientId: string): Promise<OmniRiskResult> {
    const patient = await patientRepository.findById(actor.organizationId, patientId);
    if (!patient) throw NotFound('Patient not found');

    const bio = await prisma.biomarkerSet.findFirst({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
    });
    const history = await prisma.biomarkerSet.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'asc' },
      take: 24,
    });

    const profile: HealthProfile = {
      ageYears: patient.ageYears,
      sex: patient.sex,
      labs: bio
        ? {
            systolicBp: bio.systolicBp ?? undefined,
            diastolicBp: bio.diastolicBp ?? undefined,
            ldl: bio.ldl ?? undefined,
            hdl: bio.hdl ?? undefined,
            totalChol: bio.totalChol ?? undefined,
            hba1c: bio.hba1c ?? undefined,
            bmi: bio.bmi ?? undefined,
            egfr: bio.egfr ?? undefined,
          }
        : undefined,
      lifestyle: bio
        ? {
            smokingStatus: bio.smokingStatus,
            packYears: bio.packYears,
            activityPerWeek: bio.activityPerWeek,
          }
        : undefined,
      family: bio?.familyHistoryCvd ? { affected: { CARDIOVASCULAR: 1 } } : undefined,
      history: history
        .filter((h) => h.recordedAt)
        .map((h, i) => ({
          // Аппроксимируем возраст на момент среза по позиции в истории.
          ageYears: Math.max(0, patient.ageYears - (history.length - 1 - i)),
          labs: {
            systolicBp: h.systolicBp ?? undefined,
            ldl: h.ldl ?? undefined,
            hba1c: h.hba1c ?? undefined,
            bmi: h.bmi ?? undefined,
            egfr: h.egfr ?? undefined,
          },
        })),
    };

    const result = runOmniRisk(profile);
    omniRiskComputationsTotal.inc({ model_version: result.modelVersion, kind: 'patient' });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'omnirisk.predict.patient',
      resourceType: 'patient',
      resourceId: patientId,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { healthIndex: result.healthIndex },
    });
    return result;
  },

  /** Паспорт модели (версии слоёв, метрики, режим обучения, ограничения). */
  modelCard() {
    return MODEL_CARD;
  },
};
