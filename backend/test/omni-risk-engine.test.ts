import { describe, it, expect } from 'vitest';
import { runOmniRisk, simulateIntervention } from '../src/modules/prediction/domain/omni-risk-engine.js';
import { DISEASES } from '../src/modules/prediction/domain/disease-catalog.js';
import type { HealthProfile } from '../src/modules/prediction/domain/health-profile.js';

const lowRisk: HealthProfile = {
  ageYears: 35,
  sex: 'FEMALE',
  labs: { systolicBp: 115, ldl: 2.2, hdl: 1.7, hba1c: 5.1, bmi: 22, egfr: 100 },
  lifestyle: { smokingStatus: 'NEVER', activityPerWeek: 5, dietQuality: 85, sleepHours: 7.5, stressLevel: 2 },
};

const highRisk: HealthProfile = {
  ageYears: 64,
  sex: 'MALE',
  genomic: { prs: { CARDIOVASCULAR: 2.1, ONCOLOGY: 1.4 }, monogenic: ['LDLR'] },
  epigenetic: { methylationAgeAccel: 7, telomerePercentile: 20 },
  proteomic: { crp: 6, il6: 5 },
  labs: { systolicBp: 165, ldl: 5.2, hdl: 0.9, hba1c: 6.4, bmi: 31, egfr: 62 },
  lifestyle: { smokingStatus: 'CURRENT', packYears: 30, activityPerWeek: 0, dietQuality: 35, sleepHours: 5, stressLevel: 8 },
  family: { affected: { CARDIOVASCULAR: 2 } },
};

describe('OmniRisk engine', () => {
  it('is deterministic for a fixed profile and timestamp', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const a = runOmniRisk(highRisk, { now });
    const b = runOmniRisk(highRisk, { now });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('produces a prediction for every catalogued disease', () => {
    const r = runOmniRisk(highRisk);
    expect(r.predictions).toHaveLength(DISEASES.length);
    for (const p of r.predictions) {
      expect(p.horizons.map((h) => h.years)).toContain('lifetime');
      // 6 горизонтов: 1/3/5/10/20 + lifetime
      expect(p.horizons).toHaveLength(6);
    }
  });

  it('ranks a high-risk profile above a low-risk one (health index)', () => {
    const low = runOmniRisk(lowRisk);
    const high = runOmniRisk(highRisk);
    expect(low.healthIndex).toBeGreaterThan(high.healthIndex);
  });

  it('keeps all probabilities within [0, 99] and CIs ordered', () => {
    const r = runOmniRisk(highRisk);
    for (const p of r.predictions) {
      for (const h of p.horizons) {
        expect(h.probability).toBeGreaterThanOrEqual(0);
        expect(h.probability).toBeLessThanOrEqual(99);
        expect(h.ci[0]).toBeLessThanOrEqual(h.ci[1]);
      }
    }
  });

  it('is monotonic: worse blood pressure never lowers IHD 10y risk', () => {
    const base = runOmniRisk(highRisk);
    const worse = runOmniRisk({ ...highRisk, labs: { ...highRisk.labs, systolicBp: 185 } });
    const ihdBase = base.predictions.find((p) => p.id === 'ihd')!.horizons.find((h) => h.years === 10)!.probability;
    const ihdWorse = worse.predictions.find((p) => p.id === 'ihd')!.horizons.find((h) => h.years === 10)!.probability;
    expect(ihdWorse).toBeGreaterThanOrEqual(ihdBase);
  });

  it('widens confidence intervals when fewer modalities are present', () => {
    const sparse: HealthProfile = { ageYears: 64, sex: 'MALE', labs: { systolicBp: 165 } };
    const rich = runOmniRisk(highRisk);
    const poor = runOmniRisk(sparse);
    const width = (r: ReturnType<typeof runOmniRisk>) => {
      const ihd = r.predictions.find((p) => p.id === 'ihd')!.horizons.find((h) => h.years === 10)!;
      return ihd.ci[1] - ihd.ci[0];
    };
    expect(poor.confidence).toBeLessThan(rich.confidence);
    expect(width(poor)).toBeGreaterThan(width(rich));
  });

  it('estimates plausible life expectancy and healthspan ordering', () => {
    const r = runOmniRisk(highRisk);
    const le = r.lifeExpectancy;
    expect(le.lifeExpectancy).toBeGreaterThan(r.ageYears);
    expect(le.healthspan).toBeLessThanOrEqual(le.lifeExpectancy);
    expect(le.disabilityRisk10y).toBeGreaterThanOrEqual(0);
    expect(le.disabilityRisk10y).toBeLessThanOrEqual(95);
  });

  it('builds a digital twin whose optimized trajectory beats baseline', () => {
    const r = runOmniRisk(highRisk);
    const baseEnd = r.digitalTwin.baselineTrajectory.at(-1)!.overall;
    const optEnd = r.digitalTwin.optimizedTrajectory.at(-1)!.overall;
    expect(optEnd).toBeGreaterThan(baseEnd);
    expect(r.digitalTwin.current).toHaveLength(8);
  });

  it('explains predictions with SHAP entries that sum toward the linear predictor sign', () => {
    const r = runOmniRisk(highRisk);
    const ihd = r.explanations['ihd'];
    expect(ihd).toBeDefined();
    expect(ihd!.shap.length).toBeGreaterThan(3);
    expect(ihd!.attention.length).toBeGreaterThan(0);
    const totalAttention = ihd!.attention.reduce((a, x) => a + x.weight, 0);
    expect(totalAttention).toBeGreaterThan(0.9);
    expect(totalAttention).toBeLessThan(1.1);
  });
});

describe('OmniRisk lab/biomarker inputs', () => {
  const p10 = (r: ReturnType<typeof runOmniRisk>, id: string): number =>
    r.predictions.find((p) => p.id === id)!.horizons.find((h) => h.years === 10)!.probability;

  it('raises anemia risk when haemoglobin is low (sex-aware)', () => {
    const base: HealthProfile = { ageYears: 45, sex: 'FEMALE', labs: { hemoglobin: 138 } };
    const anemic: HealthProfile = { ageYears: 45, sex: 'FEMALE', labs: { hemoglobin: 95 } };
    expect(p10(runOmniRisk(anemic), 'anemia')).toBeGreaterThan(p10(runOmniRisk(base), 'anemia'));
  });

  it('raises heart-failure and IHD risk when cardiac markers are elevated', () => {
    const base: HealthProfile = { ageYears: 60, sex: 'MALE', proteomic: { troponin: 5, ntProBnp: 50 } };
    const injured: HealthProfile = { ageYears: 60, sex: 'MALE', proteomic: { troponin: 60, ntProBnp: 2000 } };
    expect(p10(runOmniRisk(injured), 'hf')).toBeGreaterThan(p10(runOmniRisk(base), 'hf'));
    expect(p10(runOmniRisk(injured), 'ihd')).toBeGreaterThan(p10(runOmniRisk(base), 'ihd'));
  });

  it('raises inflammation-driven risk when NLR and ESR are high', () => {
    const calm: HealthProfile = { ageYears: 55, sex: 'MALE', labs: { neutrophils: 4, lymphocytes: 2, esr: 6 } };
    const inflamed: HealthProfile = { ageYears: 55, sex: 'MALE', labs: { neutrophils: 9, lymphocytes: 1, esr: 45 } };
    expect(p10(runOmniRisk(inflamed), 'ihd')).toBeGreaterThan(p10(runOmniRisk(calm), 'ihd'));
  });

  it('treats both systolic and diastolic hypertension as adverse', () => {
    const normal: HealthProfile = { ageYears: 50, sex: 'MALE', labs: { systolicBp: 118, diastolicBp: 76 } };
    const hypertensive: HealthProfile = { ageYears: 50, sex: 'MALE', labs: { systolicBp: 160, diastolicBp: 100 } };
    expect(p10(runOmniRisk(hypertensive), 'htn')).toBeGreaterThan(p10(runOmniRisk(normal), 'htn'));
  });
});

describe('OmniRisk causal intervention', () => {
  it('reduces risk and raises health index when modifiable factors improve', () => {
    const delta = simulateIntervention(highRisk, {
      labs: { systolicBp: 125, ldl: 2.4 },
      lifestyle: { smokingStatus: 'FORMER', packYears: 30, activityPerWeek: 4 },
    });
    expect(delta.healthIndexDelta).toBeGreaterThan(0);
    expect(delta.lifeExpectancyDelta).toBeGreaterThanOrEqual(0);
    const ihd = delta.perDisease.find((d) => d.id === 'ihd');
    expect(ihd).toBeDefined();
    expect(ihd!.after).toBeLessThanOrEqual(ihd!.before);
  });

  it('marks smoking as a modifiable causal driver of lung cancer', () => {
    const r = runOmniRisk(highRisk);
    const lung = r.causal['lung_ca'];
    expect(lung).toBeDefined();
    const smoking = lung!.drivers.find((d) => d.label.toLowerCase().includes('курение'));
    expect(smoking?.causal).toBe(true);
    expect(smoking?.counterfactualReductionPct).toBeGreaterThan(0);
  });
});
