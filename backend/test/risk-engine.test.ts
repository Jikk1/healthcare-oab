import { describe, it, expect } from 'vitest';
import {
  assessRisk,
  levelFromOverall,
  simulateScenario,
  MODEL_VERSION,
  type RiskFactors,
} from '../src/modules/risk/domain/risk-engine.js';

const base: RiskFactors = {
  ageYears: 50,
  sex: 'MALE',
  systolicBp: 130,
  ldl: 3.0,
  hdl: 1.3,
  hba1c: 5.6,
  bmi: 26,
  egfr: 90,
  smokingStatus: 'NEVER',
  packYears: 0,
  activityPerWeek: 3,
  familyHistoryCvd: false,
  onStatins: false,
};

describe('risk-engine', () => {
  it('is pure & deterministic — same input yields identical output', () => {
    const a = assessRisk(base);
    const b = assessRisk({ ...base });
    expect(a).toEqual(b);
  });

  it('stamps the current model version (reproducibility/audit)', () => {
    expect(assessRisk(base).modelVersion).toBe(MODEL_VERSION);
  });

  it('clamps every domain risk into bounded ranges', () => {
    const extreme: RiskFactors = {
      ...base,
      ageYears: 95,
      systolicBp: 220,
      ldl: 9,
      hdl: 0.4,
      hba1c: 13,
      bmi: 48,
      egfr: 12,
      smokingStatus: 'CURRENT',
      packYears: 80,
      familyHistoryCvd: true,
    };
    const r = assessRisk(extreme);
    for (const v of [r.cvRisk, r.miRisk, r.strokeRisk, r.dmRisk, r.oncoRisk, r.neuroRisk, r.ckdRisk]) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(95);
    }
    expect(r.overallRisk).toBeLessThanOrEqual(95);
    expect(r.riskLevel).toBe('CRITICAL');
  });

  it('is monotonic in systolic blood pressure', () => {
    const low = assessRisk({ ...base, systolicBp: 120 });
    const mid = assessRisk({ ...base, systolicBp: 150 });
    const high = assessRisk({ ...base, systolicBp: 180 });
    expect(mid.overallRisk).toBeGreaterThanOrEqual(low.overallRisk);
    expect(high.overallRisk).toBeGreaterThanOrEqual(mid.overallRisk);
  });

  it('is monotonic in LDL and pack-years', () => {
    expect(assessRisk({ ...base, ldl: 5 }).miRisk).toBeGreaterThan(
      assessRisk({ ...base, ldl: 2.6 }).miRisk,
    );
    expect(
      assessRisk({ ...base, smokingStatus: 'CURRENT', packYears: 40 }).oncoRisk,
    ).toBeGreaterThan(assessRisk({ ...base, smokingStatus: 'NEVER', packYears: 0 }).oncoRisk);
  });

  it('treats statins and exercise as protective (lower risk)', () => {
    expect(assessRisk({ ...base, onStatins: true }).miRisk).toBeLessThan(
      assessRisk({ ...base, onStatins: false }).miRisk,
    );
    expect(assessRisk({ ...base, activityPerWeek: 5 }).overallRisk).toBeLessThan(
      assessRisk({ ...base, activityPerWeek: 0 }).overallRisk,
    );
  });

  it('maps overall score to the documented level thresholds', () => {
    expect(levelFromOverall(2)).toBe('LOW');
    expect(levelFromOverall(8)).toBe('MEDIUM');
    expect(levelFromOverall(16)).toBe('HIGH');
    expect(levelFromOverall(28)).toBe('CRITICAL');
  });

  it('emits a signed, ordered SHAP attribution per factor', () => {
    const r = assessRisk(base);
    expect(r.shapFactors.length).toBeGreaterThanOrEqual(10);
    // Sorted by absolute contribution, descending.
    for (let i = 1; i < r.shapFactors.length; i++) {
      expect(Math.abs(r.shapFactors[i - 1]!.value)).toBeGreaterThanOrEqual(
        Math.abs(r.shapFactors[i]!.value),
      );
    }
  });

  it('raises biological age above chronological age for an adverse profile', () => {
    const adverse = assessRisk({
      ...base,
      systolicBp: 165,
      ldl: 5,
      smokingStatus: 'CURRENT',
      packYears: 30,
      bmi: 33,
    });
    expect(adverse.bioAge).toBeGreaterThan(adverse.chronoAge);
  });

  it('confidence intervals bracket the point estimate', () => {
    const r = assessRisk(base);
    expect(r.confidence.mi[0]).toBeLessThanOrEqual(r.miRisk);
    expect(r.confidence.mi[1]).toBeGreaterThanOrEqual(r.miRisk);
  });
});

describe('simulateScenario', () => {
  it('projects a non-negative MI reduction when factors improve', () => {
    const smoker: RiskFactors = { ...base, smokingStatus: 'CURRENT', packYears: 25, ldl: 4.5 };
    const sim = simulateScenario(smoker, { smokingStatus: 'NEVER', packYears: 0, onStatins: true });
    expect(sim.miReductionPct).toBeGreaterThan(0);
    expect(sim.modified.miRisk).toBeLessThan(sim.baseline.miRisk);
  });

  it('returns an 11-point 10-year trajectory for both arms', () => {
    const sim = simulateScenario(base, { onStatins: true });
    expect(sim.trajectory.noIntervention).toHaveLength(11);
    expect(sim.trajectory.adherent).toHaveLength(11);
    // No-intervention curve drifts upward over time.
    expect(sim.trajectory.noIntervention.at(-1)!).toBeGreaterThanOrEqual(
      sim.trajectory.noIntervention[0]!,
    );
  });
});
