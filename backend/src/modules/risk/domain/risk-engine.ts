/**
 * ============================================================
 * HealthCareOAB+ — Clinical Risk Engine (pure domain core)
 * ============================================================
 *
 * A transparent, deterministic, additive-points model in the spirit of
 * Framingham / SCORE2 / QRISK. It is intentionally *explainable*: every input
 * maps to a signed contribution (a "SHAP-like" attribution) so clinicians see
 * exactly why a score moved. This is a decision-SUPPORT tool, not a diagnostic
 * device — coefficients are illustrative and must be recalibrated on real
 * cohort data before clinical use.
 *
 * Properties guaranteed (and unit-tested):
 *  - Pure & deterministic: same input → same output, no I/O, no clock.
 *  - Monotonic in each adverse factor (more BP/LDL/pack-years ⇒ higher risk).
 *  - Bounded: every domain risk is clamped to [floor, ceil].
 *  - Versioned: MODEL_VERSION changes whenever coefficients change, so stored
 *    assessments remain reproducible/auditable.
 */

export const MODEL_VERSION = 'oab-risk-2.1.0';

export type Sex = 'MALE' | 'FEMALE' | 'OTHER';
export type SmokingStatus = 'NEVER' | 'FORMER' | 'CURRENT';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactors {
  ageYears: number;
  sex: Sex;
  systolicBp?: number; // mmHg
  ldl?: number; // mmol/L
  hdl?: number; // mmol/L
  hba1c?: number; // %
  bmi?: number; // kg/m^2
  egfr?: number; // mL/min/1.73m^2
  smokingStatus?: SmokingStatus;
  packYears?: number;
  activityPerWeek?: number; // sessions/week
  familyHistoryCvd?: boolean;
  onStatins?: boolean;
}

export interface ShapFactor {
  feature: string;
  value: number; // signed contribution (risk points)
  modifiable: boolean;
}

export interface ConfidenceIntervals {
  mi: [number, number];
  stroke: [number, number];
  dm: [number, number];
  ckd: [number, number];
}

export interface RiskAssessmentResult {
  modelVersion: string;
  chronoAge: number;
  bioAge: number;
  overallRisk: number;
  riskLevel: RiskLevel;
  cvRisk: number;
  miRisk: number;
  strokeRisk: number;
  dmRisk: number;
  oncoRisk: number;
  neuroRisk: number;
  ckdRisk: number;
  shapFactors: ShapFactor[];
  confidence: ConfidenceIntervals;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;

// Reference (optimal) values — the "no excess risk" baseline per factor.
const REF = {
  bp: 120,
  ldl: 2.6,
  hdl: 1.4,
  hba1c: 5.4,
  bmi: 23,
  egfr: 95,
  activity: 3,
};

/** Per-factor adverse contributions, in "risk points". Documented coefficients. */
function attributions(f: RiskFactors): ShapFactor[] {
  const smoking = f.smokingStatus ?? 'NEVER';
  const packYears = f.packYears ?? 0;
  const activity = f.activityPerWeek ?? 0;

  // Age dominates cardiovascular risk; ~0.55 pts/yr above 30 mirrors SCORE2 slope.
  const ageF = Math.max(0, (f.ageYears - 30) * 0.55);
  const sexF = f.sex === 'MALE' ? 3.5 : 0; // males carry higher early CVD risk
  const bpF = f.systolicBp ? Math.max(0, (f.systolicBp - REF.bp) * 0.28) : 0;
  const ldlF = f.ldl ? Math.max(0, (f.ldl - REF.ldl) * 3.4) : 0;
  const hdlF = f.hdl ? clamp((REF.hdl - f.hdl) * 4.0, -4, 8) : 0; // low HDL is adverse
  const hba1cF = f.hba1c ? Math.max(0, (f.hba1c - REF.hba1c) * 4.2) : 0;
  const bmiF = f.bmi ? Math.max(0, (f.bmi - REF.bmi) * 0.4) : 0;
  const egfrF = f.egfr ? clamp((REF.egfr - f.egfr) * 0.12, 0, 12) : 0;

  const smokeBase = smoking === 'CURRENT' ? 16 : smoking === 'FORMER' ? 5 : 0;
  const smokeF = smokeBase + packYears * 0.22;

  const famF = f.familyHistoryCvd ? 3.7 : 0;
  const statinF = f.onStatins ? -9 : 0; // protective
  const activityF = -Math.min(activity, 5) * (activity > REF.activity ? 1.6 : 1.0);

  return [
    { feature: `Возраст · ${f.ageYears} лет`, value: round1(ageF), modifiable: false },
    { feature: `Пол · ${f.sex === 'MALE' ? 'муж' : f.sex === 'FEMALE' ? 'жен' : '—'}`, value: round1(sexF), modifiable: false },
    { feature: f.systolicBp ? `АД сист. · ${f.systolicBp}` : 'АД сист. · н/д', value: round1(bpF), modifiable: true },
    { feature: f.ldl ? `LDL · ${f.ldl} ммоль/л` : 'LDL · н/д', value: round1(ldlF), modifiable: true },
    { feature: f.hdl ? `HDL · ${f.hdl} ммоль/л` : 'HDL · н/д', value: round1(hdlF), modifiable: true },
    { feature: f.hba1c ? `HbA1c · ${f.hba1c}%` : 'HbA1c · н/д', value: round1(hba1cF), modifiable: true },
    { feature: f.bmi ? `ИМТ · ${f.bmi}` : 'ИМТ · н/д', value: round1(bmiF), modifiable: true },
    { feature: f.egfr ? `СКФ · ${f.egfr}` : 'СКФ · н/д', value: round1(egfrF), modifiable: true },
    { feature: smoking === 'CURRENT' ? `Курение · ${packYears} пачко-лет` : smoking === 'FORMER' ? 'Курение · в прошлом' : 'Курение · нет', value: round1(smokeF), modifiable: true },
    { feature: 'Семейный анамнез ССЗ', value: round1(famF), modifiable: false },
    { feature: f.onStatins ? 'Статинотерапия' : 'Без статинов', value: round1(statinF), modifiable: true },
    { feature: `Физ. активность · ${activity}/нед`, value: round1(activityF), modifiable: true },
  ];
}

/** 95% CI as a symmetric-ish band that narrows for low risk and widens for high. */
function ci(point: number): [number, number] {
  const halfWidth = clamp(point * 0.18 + 1.5, 1.5, 12);
  return [round1(Math.max(0, point - halfWidth)), round1(point + halfWidth)];
}

export function levelFromOverall(overall: number): RiskLevel {
  if (overall >= 28) return 'CRITICAL';
  if (overall >= 16) return 'HIGH';
  if (overall >= 8) return 'MEDIUM';
  return 'LOW';
}

export function assessRisk(f: RiskFactors): RiskAssessmentResult {
  const shap = attributions(f);
  // Total adverse load drives the domain blends below.
  const load = shap.reduce((sum, s) => sum + s.value, 0);

  // Domain-specific blends (weights reflect which factors matter most clinically).
  const get = (label: string): number => shap.find((s) => s.feature.startsWith(label))?.value ?? 0;
  const ageF = get('Возраст');
  const bpF = get('АД');
  const ldlF = get('LDL');
  const hba1cF = get('HbA1c');
  const smokeF = get('Курение');
  const egfrF = get('СКФ');
  const bmiF = get('ИМТ');
  const statinF = get('Статин') + get('Без статинов');
  const activityF = get('Физ');

  const cvRisk = clamp(load, 1, 95);
  const miRisk = clamp(ageF + bpF + ldlF + smokeF * 1.0 + statinF + activityF * 0.6, 1, 90);
  const strokeRisk = clamp(ageF * 0.8 + bpF * 1.2 + smokeF * 0.7 + statinF * 0.5, 1, 85);
  const dmRisk = clamp(hba1cF * 1.4 + bmiF * 1.5 + ageF * 0.5 + activityF * 1.2, 1, 88);
  const oncoRisk = clamp(ageF * 1.1 + smokeF * 0.9 + bmiF * 0.4 + activityF * 0.5, 1, 80);
  const neuroRisk = clamp(ageF * 0.7 + bpF * 0.5 + activityF * 0.9 + statinF * 0.2, 1, 78);
  const ckdRisk = clamp(egfrF * 2.2 + bpF * 0.6 + hba1cF * 0.8 + ageF * 0.3, 1, 82);

  // Weighted aggregate → overall percentage and level.
  const overall = clamp(
    cvRisk * 0.34 + dmRisk * 0.22 + oncoRisk * 0.2 + neuroRisk * 0.12 + ckdRisk * 0.12,
    1,
    95,
  );

  // Biological age: chronological age shifted by net modifiable/non-modifiable load.
  const bioShift = clamp((load - Math.max(0, (f.ageYears - 30) * 0.55)) * 0.45, -8, 16);
  const bioAge = Math.round(f.ageYears + bioShift);

  return {
    modelVersion: MODEL_VERSION,
    chronoAge: f.ageYears,
    bioAge,
    overallRisk: round1(overall),
    riskLevel: levelFromOverall(overall),
    cvRisk: round1(cvRisk),
    miRisk: round1(miRisk),
    strokeRisk: round1(strokeRisk),
    dmRisk: round1(dmRisk),
    oncoRisk: round1(oncoRisk),
    neuroRisk: round1(neuroRisk),
    ckdRisk: round1(ckdRisk),
    // Most influential factors first.
    shapFactors: [...shap].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    confidence: {
      mi: ci(miRisk),
      stroke: ci(strokeRisk),
      dm: ci(dmRisk),
      ckd: ci(ckdRisk),
    },
  };
}

/**
 * Scenario simulation: project a 10-year MI trajectory under "no intervention"
 * vs "full adherence", plus the delta from a modified factor set. Used by the
 * dashboard's scenario simulator and timeline chart.
 */
export interface ScenarioProjection {
  baseline: RiskAssessmentResult;
  modified: RiskAssessmentResult;
  miReductionPct: number; // relative reduction in MI risk
  trajectory: { noIntervention: number[]; adherent: number[] };
}

export function simulateScenario(
  base: RiskFactors,
  overrides: Partial<RiskFactors>,
): ScenarioProjection {
  const baseline = assessRisk(base);
  const modified = assessRisk({ ...base, ...overrides });
  const miReductionPct =
    baseline.miRisk > 0 ? round1(((baseline.miRisk - modified.miRisk) / baseline.miRisk) * 100) : 0;

  const years = 10;
  const noIntervention: number[] = [];
  const adherent: number[] = [];
  for (let y = 0; y <= years; y++) {
    // ~3.5%/yr compounding drift without intervention; adherence bends the curve down.
    noIntervention.push(round1(clamp(baseline.miRisk * Math.pow(1.035, y), 1, 90)));
    const t = y / years;
    adherent.push(round1(clamp(baseline.miRisk * (1 - t) + modified.miRisk * t, 1, 90)));
  }

  return { baseline, modified, miReductionPct, trajectory: { noIntervention, adherent } };
}
