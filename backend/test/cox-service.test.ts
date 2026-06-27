import { describe, it, expect } from 'vitest';
import { coxService } from '../src/modules/cox/cox.service.js';

describe('Cox service — demo analysis', () => {
  const r = coxService.coxDemo();

  it('returns a converged fit with both covariates significant', () => {
    expect(r.converged).toBe(true);
    expect(r.coefficients).toHaveLength(2);
    for (const c of r.coefficients) {
      expect(c.hazardRatio).toBeGreaterThan(1);
      expect(c.pValue).toBeLessThan(0.05);
    }
  });

  it('reports a discriminating C-index and a PH test per covariate', () => {
    expect(r.cIndex).toBeGreaterThan(0.6);
    expect(r.phTest.perCovariate).toHaveLength(2);
    expect(typeof r.phTest.recommendation).toBe('string');
  });

  it('orders survival curves: high-risk profile dies faster than low-risk', () => {
    expect(r.survival).toHaveLength(3);
    const low = r.survival.find((s) => s.label === 'Низкий риск')!;
    const high = r.survival.find((s) => s.label === 'Высокий риск')!;
    const lowAt5 = low.horizons.find((h) => h.t === 5)!.survival;
    const highAt5 = high.horizons.find((h) => h.t === 5)!.survival;
    expect(highAt5).toBeLessThan(lowAt5);
    // Кривая невозрастающая и ограничена [0,1].
    for (const s of r.survival) {
      for (let i = 0; i < s.curve.length; i++) {
        expect(s.curve[i]!.survival).toBeGreaterThanOrEqual(0);
        expect(s.curve[i]!.survival).toBeLessThanOrEqual(1);
        if (i > 0) expect(s.curve[i]!.survival).toBeLessThanOrEqual(s.curve[i - 1]!.survival);
      }
    }
  });

  it('caps baseline points and exposes calibration bins', () => {
    expect(r.baseline.times.length).toBeLessThanOrEqual(81);
    expect(r.baseline.times.length).toBe(r.baseline.cumulativeHazard.length);
    expect(r.calibration.length).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    const a = coxService.coxDemo();
    const b = coxService.coxDemo();
    expect(JSON.stringify(a.coefficients)).toEqual(JSON.stringify(b.coefficients));
  });
});
