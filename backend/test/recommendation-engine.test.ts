import { describe, it, expect } from 'vitest';
import { assessRisk, type RiskFactors } from '../src/modules/risk/domain/risk-engine.js';
import { generateRecommendations } from '../src/modules/risk/domain/recommendation-engine.js';

const highRisk: RiskFactors = {
  ageYears: 60,
  sex: 'MALE',
  systolicBp: 165,
  ldl: 4.8,
  hdl: 0.9,
  hba1c: 7.2,
  bmi: 31,
  egfr: 55,
  smokingStatus: 'CURRENT',
  packYears: 30,
  activityPerWeek: 0,
  familyHistoryCvd: true,
  onStatins: false,
};

const lowRisk: RiskFactors = {
  ageYears: 35,
  sex: 'FEMALE',
  systolicBp: 115,
  ldl: 2.3,
  hdl: 1.7,
  hba1c: 5.1,
  bmi: 22,
  egfr: 99,
  smokingStatus: 'NEVER',
  packYears: 0,
  activityPerWeek: 5,
  familyHistoryCvd: false,
  onStatins: false,
};

describe('recommendation-engine', () => {
  it('is sorted by descending priority', () => {
    const recs = generateRecommendations(highRisk, assessRisk(highRisk));
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1]!.priority).toBeGreaterThanOrEqual(recs[i]!.priority);
    }
  });

  it('recommends statins for high LDL without statin therapy', () => {
    const recs = generateRecommendations(highRisk, assessRisk(highRisk));
    expect(recs.some((r) => r.title.includes('статин'))).toBe(true);
  });

  it('does not re-recommend statins when already prescribed', () => {
    const onStatins = { ...highRisk, onStatins: true };
    const recs = generateRecommendations(onStatins, assessRisk(onStatins));
    expect(recs.some((r) => r.title.includes('Назначение статинов'))).toBe(false);
  });

  it('recommends smoking cessation only for current smokers', () => {
    const smoker = generateRecommendations(highRisk, assessRisk(highRisk));
    expect(smoker.some((r) => r.title.includes('курени'))).toBe(true);
    const nonSmoker = generateRecommendations(lowRisk, assessRisk(lowRisk));
    expect(nonSmoker.some((r) => r.title.includes('курени'))).toBe(false);
  });

  it('refers to nephrology when eGFR < 60', () => {
    const recs = generateRecommendations(highRisk, assessRisk(highRisk));
    expect(recs.some((r) => r.category === 'REFERRAL' && r.title.includes('нефролог'))).toBe(true);
  });

  it('emits guideline evidence references on every recommendation', () => {
    const recs = generateRecommendations(highRisk, assessRisk(highRisk));
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => typeof r.evidence === 'string' && r.evidence.length > 0)).toBe(true);
  });

  it('produces few or no interventions for an optimal profile', () => {
    const recs = generateRecommendations(lowRisk, assessRisk(lowRisk));
    expect(recs.some((r) => r.category === 'PHARMACOLOGY')).toBe(false);
  });
});
