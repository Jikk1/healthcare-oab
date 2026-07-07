import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import ExcelJS from 'exceljs';
import {
  toDoctorDonut,
  toPatientDonut,
  toPatientTrend,
  toDoctorTrend,
  resolvePeriod,
} from '../src/modules/reports/reports.domain.js';
import { renderDonutPng } from '../src/modules/reports/donut-image.js';
import { buildReportWorkbook } from '../src/modules/reports/excel.js';
import { buildReportPdf } from '../src/modules/reports/pdf.js';

describe('reports.domain', () => {
  it('toDoctorDonut: total, order, shares ≈ 100', () => {
    const r = toDoctorDonut({ LOW: 60, MEDIUM: 20, HIGH: 15, CRITICAL: 5 });
    expect(r.centerValue).toBe('100');
    expect(r.segments.map((s) => s.label)).toEqual(['Низкий', 'Умеренный', 'Высокий', 'Критический']);
    expect(r.segments.map((s) => s.value)).toEqual([60, 20, 15, 5]);
    const shareSum = r.segments.reduce((a, s) => a + s.share, 0);
    expect(Math.round(shareSum)).toBe(100);
    expect(r.segments[0]!.color).toBe('#4AFFAA');
  });

  it('toDoctorDonut: empty cohort → zero shares, no NaN', () => {
    const r = toDoctorDonut({ LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
    expect(r.centerValue).toBe('0');
    expect(r.segments.every((s) => s.share === 0)).toBe(true);
  });

  it('toPatientDonut: composition shares ≈ 100 and centerValue = overall%', () => {
    const r = toPatientDonut({
      fullName: 'Иванов И.И.',
      overallRisk: 34.25,
      miRisk: 30,
      strokeRisk: 20,
      dmRisk: 15,
      oncoRisk: 10,
      ckdRisk: 15,
      neuroRisk: 10,
    });
    expect(r.centerValue).toBe('34.3%');
    expect(r.title).toContain('Иванов И.И.');
    expect(Math.round(r.segments.reduce((a, s) => a + s.share, 0))).toBe(100);
    expect(r.segments).toHaveLength(6);
  });
});

describe('reports.donut-image (pure-JS PNG)', () => {
  it('renders a valid PNG of the requested size with visible pixels', () => {
    const report = toDoctorDonut({ LOW: 60, MEDIUM: 20, HIGH: 15, CRITICAL: 5 });
    const buf = renderDonutPng(report, { size: 240 });
    // PNG signature
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const png = PNG.sync.read(buf);
    expect(png.width).toBe(240);
    expect(png.height).toBe(240);
    // ring должен дать непрозрачные пиксели
    let opaque = 0;
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i]! > 200) opaque++;
    expect(opaque).toBeGreaterThan(500);
  });

  it('renders empty report (track ring) without throwing', () => {
    const report = toDoctorDonut({ LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
    const buf = renderDonutPng(report, { size: 120 });
    expect(PNG.sync.read(buf).width).toBe(120);
  });
});

describe('reports.domain period + trend', () => {
  it('resolvePeriod presets bound the range and set a label', () => {
    const m = resolvePeriod({ period: 'month' });
    expect(m.key).toBe('month');
    expect(m.from.getTime()).toBeLessThan(m.to.getTime());
    expect(m.label).toContain('месяц');
    const all = resolvePeriod({});
    expect(all.key).toBe('all');
    expect(all.from.getTime()).toBe(0);
    const custom = resolvePeriod({ from: '2026-01-01', to: '2026-03-01' });
    expect(custom.key).toBe('custom');
  });

  it('toPatientTrend sorts points by date', () => {
    const t = toPatientTrend([
      { computedAt: new Date('2026-03-01'), overallRisk: 30 },
      { computedAt: new Date('2026-01-01'), overallRisk: 20 },
      { computedAt: new Date('2026-02-01'), overallRisk: 25 },
    ]);
    expect(t.points.map((p) => p.value)).toEqual([20, 25, 30]);
    expect(t.points[0]!.date).toBe('2026-01-01');
  });

  it('toDoctorTrend buckets by month and averages', () => {
    const t = toDoctorTrend([
      { computedAt: new Date('2026-01-05'), overallRisk: 10 },
      { computedAt: new Date('2026-01-20'), overallRisk: 20 },
      { computedAt: new Date('2026-02-10'), overallRisk: 40 },
    ]);
    expect(t.points).toEqual([
      { date: '2026-01', value: 15 },
      { date: '2026-02', value: 40 },
    ]);
  });
});

describe('reports.pdf', () => {
  it('produces a valid PDF with Cyrillic + trend, without throwing', async () => {
    const report = toPatientDonut({
      fullName: 'Морозов В.К.',
      overallRisk: 34.2,
      miRisk: 30,
      strokeRisk: 20,
      dmRisk: 15,
      oncoRisk: 10,
      ckdRisk: 12,
      neuroRisk: 8,
    });
    report.period = { key: 'year', label: 'За год' };
    report.generatedAt = new Date().toISOString();
    report.trend = toPatientTrend([
      { computedAt: new Date('2026-01-01'), overallRisk: 28 },
      { computedAt: new Date('2026-04-01'), overallRisk: 31 },
      { computedAt: new Date('2026-07-01'), overallRisk: 34.2 },
    ]);
    const buf = await buildReportPdf(report);
    expect(buf.subarray(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // %PDF-
    expect(buf.length).toBeGreaterThan(2000);
  });
});

describe('reports.excel', () => {
  it('produces a readable .xlsx with title, data rows and an embedded image', async () => {
    const report = toPatientDonut({
      fullName: 'Пациент Т.',
      overallRisk: 22,
      miRisk: 20,
      strokeRisk: 10,
      dmRisk: 8,
      oncoRisk: 6,
      ckdRisk: 5,
      neuroRisk: 4,
    });
    const buf = await buildReportWorkbook(report);
    // ZIP signature (xlsx = zip)
    expect([...buf.subarray(0, 2)]).toEqual([0x50, 0x4b]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf) as never);
    const ws = wb.getWorksheet('Отчёт');
    expect(ws).toBeTruthy();
    expect(String(ws!.getCell('A1').value)).toContain('Профиль риска');
    // строки данных присутствуют (первая категория — «Инфаркт (ИМ)»)
    expect(String(ws!.getCell('B5').value)).toContain('Инфаркт');
    // встроено изображение
    expect(wb.model.media.filter((m) => m.type === 'image').length).toBeGreaterThan(0);
  });
});
