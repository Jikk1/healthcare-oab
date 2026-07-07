import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  probAt, ciAt, riskColor, levelColor, levelLabel,
  renderKpis, renderCatFilter, renderDiseases,
} from '../../lib/omni-render.js';

const disease = (over = {}) => ({
  id: 'ihd', name: 'ИБС', icd11: 'BA00', category: 'CARDIOVASCULAR',
  riskLevel: 'HIGH', relativeRisk: 2.1, onsetAgeEstimate: 61,
  horizons: [{ years: 10, probability: 34, ci: [28, 41] }, { years: 'lifetime', probability: 70, ci: [60, 80] }],
  ...over,
});
const result = (preds) => ({ predictions: preds });
const CATS = { CARDIOVASCULAR: 'Сердце', ONCOLOGY: 'Онко' };

describe('omni-render: чистые хелперы', () => {
  it('probAt/ciAt берут нужный горизонт, иначе дефолт', () => {
    const p = disease();
    expect(probAt(p, 10)).toBe(34);
    expect(probAt(p, '10')).toBe(34); // строка/число эквивалентны
    expect(probAt(p, 3)).toBe(0);
    expect(ciAt(p, 'lifetime')).toEqual([60, 80]);
    expect(ciAt(p, 99)).toEqual([0, 0]);
  });

  it('riskColor/levelColor/levelLabel — пороги и мапы', () => {
    expect(riskColor(5)).not.toBe(riskColor(50));
    expect(levelColor('HIGH')).toBe(levelColor('high'));
    expect(levelLabel.CRITICAL).toBe('Критический');
  });
});

describe('omni-render: renderDiseases', () => {
  let el;
  beforeEach(() => { el = document.createElement('div'); });

  it('сортирует по риску на горизонте и подставляет метку ДИ/CI', () => {
    const r = result([disease({ id: 'a', horizons: [{ years: 10, probability: 10, ci: [5, 15] }] }),
                       disease({ id: 'b', horizons: [{ years: 10, probability: 80, ci: [70, 90] }] })]);
    renderDiseases(el, r, { horizon: 10, category: 'all', categoryLabels: CATS, ciLabel: 'ДИ' });
    const rows = el.querySelectorAll('.or-disease');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.or-prob').textContent).toBe('80%'); // выше — первым
    expect(el.innerHTML).toContain('ДИ 70–90%');
  });

  it('clickable=true добавляет data-disease и зовёт onSelect', () => {
    const onSelect = vi.fn();
    renderDiseases(el, result([disease()]), { horizon: 10, category: 'all', categoryLabels: CATS, clickable: true, onSelect });
    const row = el.querySelector('.or-disease');
    expect(row.getAttribute('data-disease')).toBe('ihd');
    row.click();
    expect(onSelect).toHaveBeenCalledWith('ihd');
  });

  it('clickable=false — без data-disease и слушателей; badgeExtra попадает в бейдж', () => {
    renderDiseases(el, result([disease()]), { horizon: 10, category: 'all', categoryLabels: CATS, badgeExtra: ';font-size:10px' });
    const row = el.querySelector('.or-disease');
    expect(row.getAttribute('data-disease')).toBeNull();
    expect(row.querySelector('.risk-badge').getAttribute('data-sty')).toContain('font-size:10px');
  });

  it('фильтр по категории и горизонт-метка', () => {
    const horizonLabelEl = document.createElement('span');
    const r = result([disease({ id: 'a', category: 'CARDIOVASCULAR' }), disease({ id: 'b', category: 'ONCOLOGY' })]);
    renderDiseases(el, r, { horizon: 10, category: 'ONCOLOGY', categoryLabels: CATS, horizonLabelEl });
    expect(el.querySelectorAll('.or-disease').length).toBe(1);
    expect(horizonLabelEl.textContent).toBe('· 10 лет');
  });

  it('null-результат не роняет рендер', () => {
    expect(() => renderDiseases(el, null, { horizon: 10, categoryLabels: CATS })).not.toThrow();
  });
});

describe('omni-render: renderCatFilter / renderKpis', () => {
  it('renderCatFilter строит чипы «Все»+категории, onSelect по клику', () => {
    const el = document.createElement('div');
    const onSelect = vi.fn();
    renderCatFilter(el, result([disease({ category: 'CARDIOVASCULAR' })]), CATS, 'all', onSelect);
    const btns = el.querySelectorAll('button');
    expect(btns.length).toBe(2); // Все + CARDIOVASCULAR
    expect(btns[0].classList.contains('active')).toBe(true);
    btns[1].click();
    expect(onSelect).toHaveBeenCalledWith('CARDIOVASCULAR');
  });

  it('renderKpis выводит по плитке на элемент массива', () => {
    const el = document.createElement('div');
    renderKpis(el, [{ v: 88, l: 'Индекс', hint: 'x', color: '#fff' }, { v: 5, l: 'Болезней', color: '#000' }]);
    expect(el.querySelectorAll('.or-kpi').length).toBe(2);
    expect(el.querySelectorAll('.hint').length).toBe(1); // без hint — нет узла
  });
});
