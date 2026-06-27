import { describe, it, expect } from 'vitest';
import {
  fitCox,
  survivalCurve,
  survivalAt,
  linearPredictor,
  type CoxObservation,
} from '../src/modules/cox/domain/cox-model.js';
import { proportionalHazardsTest, concordanceIndex, calibrationCurve } from '../src/modules/cox/domain/diagnostics.js';
import { invert, normalCdf } from '../src/modules/cox/domain/linalg.js';

/** Детерминированный ГПСЧ (LCG) — данные воспроизводимы между запусками. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Синтетика с ИЗВЕСТНЫМИ коэффициентами и точной пропорциональностью рисков:
 * экспоненциальная база, T = −ln(U) / (λ₀·exp(βₜₓ)). Подгонка должна восстановить β.
 */
function makeData(seed = 42, n = 600): { data: CoxObservation[]; betaTrue: [number, number] } {
  const rand = lcg(seed);
  const betaTrue: [number, number] = [0.9, 0.7];
  const data: CoxObservation[] = [];
  for (let i = 0; i < n; i++) {
    const age = rand() * 2 - 1; // стандартизованный возраст [-1, 1]
    const bio = rand() < 0.5 ? 0 : 1; // бинарный биомаркер
    const x = [age, bio];
    const lp = betaTrue[0] * age + betaTrue[1] * bio;
    const lambda = 0.12 * Math.exp(lp);
    const t = -Math.log(1 - rand()) / lambda;
    const censor = 8;
    data.push({ time: Math.min(t, censor), event: t <= censor ? 1 : 0, x });
  }
  return { data, betaTrue };
}

describe('linalg', () => {
  it('inverts a matrix (A·A⁻¹ = I)', () => {
    const A = [
      [4, 7],
      [2, 6],
    ];
    const inv = invert(A);
    const prod = [
      [A[0]![0]! * inv[0]![0]! + A[0]![1]! * inv[1]![0]!, A[0]![0]! * inv[0]![1]! + A[0]![1]! * inv[1]![1]!],
      [A[1]![0]! * inv[0]![0]! + A[1]![1]! * inv[1]![0]!, A[1]![0]! * inv[0]![1]! + A[1]![1]! * inv[1]![1]!],
    ];
    expect(prod[0]![0]!).toBeCloseTo(1, 6);
    expect(prod[1]![1]!).toBeCloseTo(1, 6);
    expect(prod[0]![1]!).toBeCloseTo(0, 6);
    expect(prod[1]![0]!).toBeCloseTo(0, 6);
  });

  it('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('Cox PH fit', () => {
  const { data, betaTrue } = makeData();
  const fit = fitCox(data, { covariateNames: ['age', 'biomarker'] });

  it('converges', () => {
    expect(fit.converged).toBe(true);
    expect(fit.n).toBe(600);
    expect(fit.events).toBeGreaterThan(100);
  });

  it('recovers the true coefficients within tolerance', () => {
    const b0 = fit.beta[0]!;
    const b1 = fit.beta[1]!;
    expect(b0).toBeGreaterThan(betaTrue[0] * 0.6);
    expect(b0).toBeLessThan(betaTrue[0] * 1.4);
    expect(b1).toBeGreaterThan(betaTrue[1] * 0.6);
    expect(b1).toBeLessThan(betaTrue[1] * 1.4);
  });

  it('reports hazard ratios with significant p-values and CIs excluding 1', () => {
    for (const c of fit.coefficients) {
      expect(c.hazardRatio).toBeCloseTo(Math.exp(c.beta), 4);
      expect(c.pValue).toBeLessThan(0.05);
      expect(c.ci95[0]).toBeLessThan(c.hazardRatio);
      expect(c.ci95[1]).toBeGreaterThan(c.hazardRatio);
      expect(c.ci95[0]).toBeGreaterThan(1); // оба фактора повышают риск
    }
  });

  it('is deterministic', () => {
    const a = fitCox(data, { covariateNames: ['age', 'biomarker'] });
    const b = fitCox(data, { covariateNames: ['age', 'biomarker'] });
    expect(JSON.stringify(a.beta)).toEqual(JSON.stringify(b.beta));
  });

  it('produces a monotonically non-decreasing baseline cumulative hazard', () => {
    const h = fit.baseline.cumulativeHazard;
    expect(h.length).toBeGreaterThan(10);
    for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThanOrEqual(h[i - 1]!);
  });
});

describe('Cox survival prediction', () => {
  const { data } = makeData();
  const fit = fitCox(data);

  it('survival curve is in [0,1] and non-increasing', () => {
    const curve = survivalCurve(fit, [1, 1]);
    expect(curve.length).toBeGreaterThan(0);
    for (let i = 0; i < curve.length; i++) {
      const s = curve[i]!.survival;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      if (i > 0) expect(s).toBeLessThanOrEqual(curve[i - 1]!.survival);
    }
  });

  it('higher-risk covariates give lower survival', () => {
    const tMid = fit.baseline.times[Math.floor(fit.baseline.times.length / 2)]!;
    const lowRisk = survivalAt(fit, [-1, 0], tMid);
    const highRisk = survivalAt(fit, [1, 1], tMid);
    expect(highRisk).toBeLessThan(lowRisk);
    expect(linearPredictor(fit.beta, [1, 1])).toBeGreaterThan(linearPredictor(fit.beta, [-1, 0]));
  });
});

describe('Cox diagnostics', () => {
  const { data } = makeData();
  const fit = fitCox(data, { covariateNames: ['age', 'biomarker'] });

  it('C-index indicates good discrimination (> 0.62)', () => {
    const c = concordanceIndex(data, fit);
    expect(c).toBeGreaterThan(0.62);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('PH test returns a result per covariate', () => {
    const ph = proportionalHazardsTest(data, fit, ['age', 'biomarker']);
    expect(ph.perCovariate).toHaveLength(2);
    for (const r of ph.perCovariate) {
      expect(r.pValue).toBeGreaterThanOrEqual(0);
      expect(r.pValue).toBeLessThanOrEqual(1);
      expect(typeof r.violated).toBe('boolean');
    }
    expect(typeof ph.recommendation).toBe('string');
  });

  it('calibration bins are ordered and roughly accurate for a well-specified model', () => {
    const horizon = fit.baseline.times[Math.floor(fit.baseline.times.length * 0.6)]!;
    const cal = calibrationCurve(data, fit, horizon, 5);
    expect(cal.length).toBeGreaterThan(1);
    for (let i = 1; i < cal.length; i++) expect(cal[i]!.predicted).toBeGreaterThanOrEqual(cal[i - 1]!.predicted);
    const mae = cal.reduce((s, b) => s + Math.abs(b.predicted - b.observed), 0) / cal.length;
    expect(mae).toBeLessThan(0.15);
  });
});
