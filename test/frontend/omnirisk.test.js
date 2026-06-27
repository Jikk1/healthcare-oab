import { describe, it, expect, beforeAll } from 'vitest';

// omnirisk.js — самодостаточный IIFE, навешивает window.OmniRisk.
let OmniRisk;
beforeAll(async () => {
  await import('../../omnirisk.js');
  OmniRisk = window.OmniRisk;
});

const healthy = { ageYears: 35, sex: 'FEMALE', labs: { systolicBp: 115, ldl: 2.4, hdl: 1.6, hba1c: 5.0, bmi: 22 }, lifestyle: { smokingStatus: 'NEVER', activityPerWeek: 5 } };
const highRisk = { ageYears: 66, sex: 'MALE', labs: { systolicBp: 168, ldl: 4.8, hdl: 0.9, hba1c: 6.4, bmi: 31 }, lifestyle: { smokingStatus: 'CURRENT', packYears: 30 } };

const p10 = (r, id) => {
  const p = r.predictions.find((x) => x.id === id);
  const h = p && p.horizons.find((hh) => hh.years === 10);
  return h ? h.probability : 0;
};

describe('OmniRisk.runOmniRisk', () => {
  it('возвращает корректную структуру результата', () => {
    const r = OmniRisk.runOmniRisk(highRisk);
    expect(Array.isArray(r.predictions)).toBe(true);
    expect(r.predictions.length).toBeGreaterThan(5);
    expect(r.healthIndex).toBeGreaterThanOrEqual(1);
    expect(r.healthIndex).toBeLessThanOrEqual(100);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.lifeExpectancy).toBeTruthy();
    expect(r.lifeExpectancy.biologicalAge).toBeGreaterThan(0);
    const pr = r.predictions[0];
    expect(pr).toHaveProperty('id');
    expect(pr).toHaveProperty('horizons');
    expect(pr.horizons.find((h) => h.years === 10)).toBeTruthy();
  });

  it('детерминирован (одинаковый ввод → одинаковый вывод)', () => {
    const a = OmniRisk.runOmniRisk(highRisk);
    const b = OmniRisk.runOmniRisk(highRisk);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('профиль высокого риска даёт более высокий индекс здоровья у здорового', () => {
    const h = OmniRisk.runOmniRisk(healthy);
    const s = OmniRisk.runOmniRisk(highRisk);
    expect(h.healthIndex).toBeGreaterThan(s.healthIndex);
    // ИБС у пациента высокого риска вероятнее.
    expect(p10(s, 'ihd')).toBeGreaterThan(p10(h, 'ihd'));
  });

  it('вероятности на 10 лет в диапазоне [0,100], доверительный интервал корректен', () => {
    const r = OmniRisk.runOmniRisk(highRisk);
    for (const p of r.predictions) {
      const h = p.horizons.find((x) => x.years === 10);
      expect(h.probability).toBeGreaterThanOrEqual(0);
      expect(h.probability).toBeLessThanOrEqual(100);
      expect(h.ci[0]).toBeLessThanOrEqual(h.probability);
      expect(h.ci[1]).toBeGreaterThanOrEqual(h.probability);
    }
  });

  it('полнота данных растёт с числом заполненных модальностей', () => {
    const sparse = OmniRisk.runOmniRisk({ ageYears: 50, sex: 'MALE', lifestyle: { smokingStatus: 'NEVER' } });
    const rich = OmniRisk.runOmniRisk(highRisk);
    expect(rich.completeness).toBeGreaterThan(sparse.completeness);
  });
});

describe('OmniRisk.simulateIntervention', () => {
  it('контроль АД снижает риск и повышает индекс здоровья', () => {
    const sim = OmniRisk.simulateIntervention(highRisk, { labs: { systolicBp: 125 } });
    expect(sim.baseline).toBeTruthy();
    expect(sim.modified).toBeTruthy();
    expect(sim.healthIndexDelta).toBeGreaterThanOrEqual(0);
    // Хотя бы по одному заболеванию есть снижение риска.
    expect(sim.perDisease.some((d) => d.reductionPct > 0)).toBe(true);
  });

  it('детерминирован', () => {
    const a = OmniRisk.simulateIntervention(highRisk, { labs: { ldl: 2.0 } });
    const b = OmniRisk.simulateIntervention(highRisk, { labs: { ldl: 2.0 } });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
