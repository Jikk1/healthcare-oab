/**
 * Seed: provisions a demo tenant that mirrors the HealthCareOAB+ dashboard
 * fixture (10 patients, P-00142 … P-00916). Biomarker snapshots are scored
 * through the real risk engine so the persisted assessments, SHAP factors and
 * recommendations are genuine engine output — not hand-typed numbers.
 *
 * Idempotent: safe to run repeatedly (upserts by natural keys, skips patients
 * that already exist for the org).
 */
import { Prisma, PrismaClient, type Sex, type SmokingStatus } from '@prisma/client';
import { hashPassword, encryptField, encryptNullable, sha256 } from '../src/shared/crypto.js';
import {
  assessRisk,
  type RiskFactors,
} from '../src/modules/risk/domain/risk-engine.js';
import { generateRecommendations } from '../src/modules/risk/domain/recommendation-engine.js';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@oab-clinic.demo';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'OabDemo_Owner_2026!';
const CLINICIAN_EMAIL = 'clinician@oab-clinic.demo';
const CLINICIAN_PASSWORD = process.env.SEED_CLINICIAN_PASSWORD ?? 'OabDemo_Clinician_2026!';
const ORG_SLUG = 'oab-clinic-demo';

interface SeedPatient {
  mrn: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  age: number;
  bio: Omit<RiskFactors, 'ageYears' | 'sex'> & {
    diastolicBp?: number;
    totalChol?: number;
    smokingStatus?: SmokingStatus;
  };
}

// Surnames/forenames split from the dashboard's "ФИО" strings.
const PATIENTS: SeedPatient[] = [
  {
    mrn: 'P-00142', lastName: 'Морозов', firstName: 'Владимир', sex: 'MALE', age: 58,
    bio: { systolicBp: 165, diastolicBp: 98, ldl: 4.8, hdl: 0.9, totalChol: 7.2, hba1c: 7.2, bmi: 31, egfr: 62, smokingStatus: 'CURRENT', packYears: 30, activityPerWeek: 0, familyHistoryCvd: true, onStatins: false },
  },
  {
    mrn: 'P-00089', lastName: 'Серебрякова', firstName: 'Ирина', sex: 'FEMALE', age: 52,
    bio: { systolicBp: 158, diastolicBp: 95, ldl: 4.5, hdl: 1.0, totalChol: 6.9, hba1c: 7.8, bmi: 33, egfr: 70, smokingStatus: 'FORMER', packYears: 12, activityPerWeek: 1, familyHistoryCvd: true, onStatins: false },
  },
  {
    mrn: 'P-00217', lastName: 'Кузнецов', firstName: 'Артём', sex: 'MALE', age: 61,
    bio: { systolicBp: 148, diastolicBp: 90, ldl: 3.8, hdl: 1.1, totalChol: 6.1, hba1c: 6.0, bmi: 28, egfr: 80, smokingStatus: 'FORMER', packYears: 10, activityPerWeek: 2, familyHistoryCvd: false, onStatins: true },
  },
  {
    mrn: 'P-00305', lastName: 'Воронова', firstName: 'Татьяна', sex: 'FEMALE', age: 47,
    bio: { systolicBp: 145, diastolicBp: 88, ldl: 4.0, hdl: 1.2, totalChol: 6.0, hba1c: 6.3, bmi: 29, egfr: 85, smokingStatus: 'CURRENT', packYears: 12, activityPerWeek: 1, familyHistoryCvd: false, onStatins: false },
  },
  {
    mrn: 'P-00412', lastName: 'Белов', firstName: 'Николай', sex: 'MALE', age: 55,
    bio: { systolicBp: 142, diastolicBp: 86, ldl: 3.5, hdl: 1.2, totalChol: 5.6, hba1c: 5.8, bmi: 27, egfr: 88, smokingStatus: 'FORMER', packYears: 8, activityPerWeek: 2, familyHistoryCvd: true, onStatins: true },
  },
  {
    mrn: 'P-00523', lastName: 'Литвинова', firstName: 'Ольга', sex: 'FEMALE', age: 44,
    bio: { systolicBp: 132, diastolicBp: 82, ldl: 3.0, hdl: 1.4, totalChol: 5.1, hba1c: 5.6, bmi: 26, egfr: 92, smokingStatus: 'NEVER', packYears: 0, activityPerWeek: 3, familyHistoryCvd: false, onStatins: false },
  },
  {
    mrn: 'P-00677', lastName: 'Гусев', firstName: 'Дмитрий', sex: 'MALE', age: 49,
    bio: { systolicBp: 134, diastolicBp: 84, ldl: 3.2, hdl: 1.3, totalChol: 5.3, hba1c: 5.7, bmi: 26, egfr: 90, smokingStatus: 'FORMER', packYears: 3, activityPerWeek: 3, familyHistoryCvd: false, onStatins: false },
  },
  {
    mrn: 'P-00712', lastName: 'Новикова', firstName: 'Анна', sex: 'FEMALE', age: 39,
    bio: { systolicBp: 122, diastolicBp: 78, ldl: 2.6, hdl: 1.6, totalChol: 4.6, hba1c: 5.3, bmi: 23, egfr: 98, smokingStatus: 'NEVER', packYears: 0, activityPerWeek: 4, familyHistoryCvd: false, onStatins: false },
  },
  {
    mrn: 'P-00804', lastName: 'Федоров', firstName: 'Игорь', sex: 'MALE', age: 42,
    bio: { systolicBp: 124, diastolicBp: 80, ldl: 2.8, hdl: 1.5, totalChol: 4.8, hba1c: 5.4, bmi: 24, egfr: 96, smokingStatus: 'NEVER', packYears: 0, activityPerWeek: 4, familyHistoryCvd: false, onStatins: false },
  },
  {
    mrn: 'P-00916', lastName: 'Рыбакова', firstName: 'Елена', sex: 'FEMALE', age: 36,
    bio: { systolicBp: 118, diastolicBp: 74, ldl: 2.4, hdl: 1.7, totalChol: 4.3, hba1c: 5.1, bmi: 22, egfr: 99, smokingStatus: 'NEVER', packYears: 0, activityPerWeek: 5, familyHistoryCvd: false, onStatins: false },
  },
];

function birthDateFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const trialEnd = new Date(Date.now() + 365 * 24 * 3600 * 1000);

  const organization = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: 'Клиника OAB · Demo',
      slug: ORG_SLUG,
      country: 'RU',
      timezone: 'Europe/Moscow',
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      plan: 'PRO',
      status: 'ACTIVE',
      patientLimit: null,
      seatLimit: 50,
      currentPeriodEnd: trialEnd,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      email: OWNER_EMAIL,
      passwordHash: await hashPassword(OWNER_PASSWORD),
      fullName: 'Демо Владелец',
      isEmailVerified: true,
    },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: organization.id } },
    update: { role: 'OWNER' },
    create: { userId: owner.id, organizationId: organization.id, role: 'OWNER' },
  });

  const clinician = await prisma.user.upsert({
    where: { email: CLINICIAN_EMAIL },
    update: {},
    create: {
      email: CLINICIAN_EMAIL,
      passwordHash: await hashPassword(CLINICIAN_PASSWORD),
      fullName: 'Демо Клиницист',
      isEmailVerified: true,
    },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: clinician.id, organizationId: organization.id } },
    update: { role: 'CLINICIAN' },
    create: { userId: clinician.id, organizationId: organization.id, role: 'CLINICIAN' },
  });

  let created = 0;
  for (const p of PATIENTS) {
    const existing = await prisma.patient.findUnique({
      where: { organizationId_mrn: { organizationId: organization.id, mrn: p.mrn } },
    });
    if (existing) continue;

    const factors: RiskFactors = {
      ageYears: p.age,
      sex: p.sex,
      systolicBp: p.bio.systolicBp,
      ldl: p.bio.ldl,
      hdl: p.bio.hdl,
      hba1c: p.bio.hba1c,
      bmi: p.bio.bmi,
      egfr: p.bio.egfr,
      smokingStatus: p.bio.smokingStatus,
      packYears: p.bio.packYears,
      activityPerWeek: p.bio.activityPerWeek,
      familyHistoryCvd: p.bio.familyHistoryCvd,
      onStatins: p.bio.onStatins,
    };
    const result = assessRisk(factors);
    const recs = generateRecommendations(factors, result);

    await prisma.patient.create({
      data: {
        organizationId: organization.id,
        mrn: p.mrn,
        firstNameEnc: encryptField(p.firstName),
        lastNameEnc: encryptField(p.lastName),
        birthDateEnc: encryptNullable(birthDateFromAge(p.age)),
        sex: p.sex,
        ageYears: p.age,
        latestRiskLevel: result.riskLevel,
        latestCvRisk: result.cvRisk,
        latestDmRisk: result.dmRisk,
        latestBioAge: result.bioAge,
        biomarkerSets: {
          create: {
            systolicBp: p.bio.systolicBp,
            diastolicBp: p.bio.diastolicBp,
            ldl: p.bio.ldl,
            hdl: p.bio.hdl,
            totalChol: p.bio.totalChol,
            hba1c: p.bio.hba1c,
            bmi: p.bio.bmi,
            egfr: p.bio.egfr,
            smokingStatus: p.bio.smokingStatus ?? 'NEVER',
            packYears: p.bio.packYears ?? 0,
            activityPerWeek: p.bio.activityPerWeek ?? 0,
            familyHistoryCvd: p.bio.familyHistoryCvd ?? false,
            onStatins: p.bio.onStatins ?? false,
          },
        },
        assessments: {
          create: {
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
        },
        recommendations: {
          create: recs.map((r) => ({
            category: r.category,
            title: r.title,
            detail: r.detail,
            impact: r.impact,
            evidence: r.evidence,
            priority: r.priority,
          })),
        },
      },
    });
    created += 1;
  }

  // Genesis audit entry so the hash chain has a verifiable root.
  const genesisCanonical = JSON.stringify({
    o: organization.id, a: owner.id, act: 'seed.bootstrap', rt: null, ri: null, m: null,
  });
  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: owner.id,
      action: 'seed.bootstrap',
      entryHash: sha256(`|${genesisCanonical}`),
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `\nSeed complete:\n  org: ${organization.name} (${organization.slug})\n  owner: ${OWNER_EMAIL} / ${OWNER_PASSWORD}\n  clinician: ${CLINICIAN_EMAIL} / ${CLINICIAN_PASSWORD}\n  patients created: ${created} (total fixtures: ${PATIENTS.length})\n`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
