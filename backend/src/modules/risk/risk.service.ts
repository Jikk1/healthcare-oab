import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { NotFound } from '../../shared/errors.js';
import { riskComputationsTotal } from '../../shared/metrics.js';
import { auditService } from '../audit/audit.service.js';
import { patientRepository } from '../patients/patient.repository.js';
import type { ActorContext } from '../patients/patient.service.js';
import type { BiomarkerBody } from '../patients/patient.schema.js';
import {
  assessRisk,
  simulateScenario,
  type RiskFactors,
  type RiskAssessmentResult,
} from './domain/risk-engine.js';
import { generateRecommendations } from './domain/recommendation-engine.js';

function factorsFrom(
  patient: { ageYears: number; sex: RiskFactors['sex'] },
  b: BiomarkerBody,
): RiskFactors {
  return {
    ageYears: patient.ageYears,
    sex: patient.sex,
    systolicBp: b.systolicBp,
    ldl: b.ldl,
    hdl: b.hdl,
    hba1c: b.hba1c,
    bmi: b.bmi,
    egfr: b.egfr,
    smokingStatus: b.smokingStatus,
    packYears: b.packYears,
    activityPerWeek: b.activityPerWeek,
    familyHistoryCvd: b.familyHistoryCvd,
    onStatins: b.onStatins,
  };
}

export const riskService = {
  /**
   * Capture a biomarker snapshot, score it, persist the assessment +
   * regenerated recommendations + an outbox event, and refresh the patient's
   * denormalised risk cache — all atomically.
   */
  async assess(actor: ActorContext, patientId: string, body: BiomarkerBody) {
    const patient = await patientRepository.findById(actor.organizationId, patientId);
    if (!patient) throw NotFound('Patient not found');

    const factors = factorsFrom(patient, body);
    const result = assessRisk(factors);
    const recs = generateRecommendations(factors, result);

    const saved = await prisma.$transaction(async (tx) => {
      const biomarkerSet = await tx.biomarkerSet.create({
        data: {
          patientId,
          systolicBp: body.systolicBp,
          diastolicBp: body.diastolicBp,
          ldl: body.ldl,
          hdl: body.hdl,
          totalChol: body.totalChol,
          hba1c: body.hba1c,
          bmi: body.bmi,
          egfr: body.egfr,
          smokingStatus: body.smokingStatus,
          packYears: body.packYears,
          activityPerWeek: body.activityPerWeek,
          familyHistoryCvd: body.familyHistoryCvd,
          onStatins: body.onStatins,
        },
      });

      const assessment = await tx.riskAssessment.create({
        data: {
          patientId,
          biomarkerSetId: biomarkerSet.id,
          modelVersion: result.modelVersion,
          overallRisk: result.overallRisk,
          riskLevel: result.riskLevel,
          bioAge: result.bioAge,
          chronoAge: result.chronoAge,
          cvRisk: result.cvRisk,
          miRisk: result.miRisk,
          strokeRisk: result.strokeRisk,
          dmRisk: result.dmRisk,
          oncoRisk: result.oncoRisk,
          neuroRisk: result.neuroRisk,
          ckdRisk: result.ckdRisk,
          shapFactors: result.shapFactors as unknown as Prisma.InputJsonValue,
          confidence: result.confidence as unknown as Prisma.InputJsonValue,
        },
      });

      // Replace the active recommendation set (history lives in assessments).
      await tx.recommendation.deleteMany({ where: { patientId, isApplied: false } });
      if (recs.length) {
        await tx.recommendation.createMany({
          data: recs.map((r) => ({
            patientId,
            category: r.category,
            title: r.title,
            detail: r.detail,
            impact: r.impact,
            evidence: r.evidence,
            priority: r.priority,
          })),
        });
      }

      await tx.patient.update({
        where: { id: patientId },
        data: {
          latestRiskLevel: result.riskLevel,
          latestCvRisk: result.cvRisk,
          latestDmRisk: result.dmRisk,
          latestBioAge: result.bioAge,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregate: 'patient',
          aggregateId: patientId,
          type: 'risk.assessed',
          payload: {
            patientId,
            organizationId: actor.organizationId,
            riskLevel: result.riskLevel,
            overallRisk: result.overallRisk,
            modelVersion: result.modelVersion,
          },
        },
      });

      return assessment;
    });

    riskComputationsTotal.inc({ model_version: result.modelVersion, level: result.riskLevel });
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'risk.assess',
      resourceType: 'patient',
      resourceId: patientId,
      metadata: { riskLevel: result.riskLevel, overall: result.overallRisk },
    });

    return { assessment: saved, result, recommendations: recs };
  },

  async latest(actor: ActorContext, patientId: string): Promise<RiskAssessmentResult & { id: string; computedAt: Date }> {
    const patient = await patientRepository.findById(actor.organizationId, patientId);
    if (!patient) throw NotFound('Patient not found');
    const a = await prisma.riskAssessment.findFirst({
      where: { patientId },
      orderBy: { computedAt: 'desc' },
    });
    if (!a) throw NotFound('No assessment yet for this patient');
    return {
      id: a.id,
      computedAt: a.computedAt,
      modelVersion: a.modelVersion,
      chronoAge: a.chronoAge,
      bioAge: a.bioAge,
      overallRisk: a.overallRisk,
      riskLevel: a.riskLevel,
      cvRisk: a.cvRisk,
      miRisk: a.miRisk,
      strokeRisk: a.strokeRisk,
      dmRisk: a.dmRisk,
      oncoRisk: a.oncoRisk,
      neuroRisk: a.neuroRisk,
      ckdRisk: a.ckdRisk,
      shapFactors: a.shapFactors as unknown as RiskAssessmentResult['shapFactors'],
      confidence: a.confidence as unknown as RiskAssessmentResult['confidence'],
    };
  },

  /** Ephemeral what-if: never persisted, used by the scenario simulator UI. */
  async simulate(actor: ActorContext, patientId: string, overrides: Partial<BiomarkerBody>) {
    const patient = await patientRepository.findById(actor.organizationId, patientId);
    if (!patient) throw NotFound('Patient not found');
    const lastBio = await prisma.biomarkerSet.findFirst({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
    });
    const base: RiskFactors = {
      ageYears: patient.ageYears,
      sex: patient.sex,
      systolicBp: lastBio?.systolicBp ?? undefined,
      ldl: lastBio?.ldl ?? undefined,
      hdl: lastBio?.hdl ?? undefined,
      hba1c: lastBio?.hba1c ?? undefined,
      bmi: lastBio?.bmi ?? undefined,
      egfr: lastBio?.egfr ?? undefined,
      smokingStatus: lastBio?.smokingStatus ?? 'NEVER',
      packYears: lastBio?.packYears ?? 0,
      activityPerWeek: lastBio?.activityPerWeek ?? 0,
      familyHistoryCvd: lastBio?.familyHistoryCvd ?? false,
      onStatins: lastBio?.onStatins ?? false,
    };
    const overrideFactors: Partial<RiskFactors> = {
      systolicBp: overrides.systolicBp,
      ldl: overrides.ldl,
      bmi: overrides.bmi,
      hba1c: overrides.hba1c,
      smokingStatus: overrides.smokingStatus,
      packYears: overrides.packYears,
      activityPerWeek: overrides.activityPerWeek,
      onStatins: overrides.onStatins,
    };
    // Drop undefined overrides so they don't clobber the baseline.
    for (const k of Object.keys(overrideFactors) as (keyof RiskFactors)[]) {
      if (overrideFactors[k] === undefined) delete overrideFactors[k];
    }
    return simulateScenario(base, overrideFactors);
  },
};
