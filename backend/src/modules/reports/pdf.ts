import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DonutReport, TrendSeries } from './reports.domain.js';
import { renderDonutPng } from './donut-image.js';

/**
 * PDF-экспорт отчёта (pdfkit, чистый JS). Кириллица — через встроенный шрифт
 * Inter (@fontsource woff; стандартные PDF-шрифты Cyrillic не поддерживают).
 * Содержит: заголовок+период, кольцевую диаграмму (PNG), таблицу данных,
 * линейный график динамики (векторно) и комплаенс-подвал про ПДн.
 */

const req = createRequire(import.meta.url);
const FONT_REG = readFileSync(req.resolve('@fontsource/inter/files/inter-cyrillic-400-normal.woff'));
const FONT_BOLD = readFileSync(req.resolve('@fontsource/inter/files/inter-cyrillic-600-normal.woff'));

const INK = '#1B2233';
const MUTED = '#6B7489';
const HEAD_BG = '#0F1424';

export function buildReportPdf(report: DonutReport): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: report.title, Author: 'HealthCareOAB+', Creator: 'HealthCareOAB+ Reporting' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);

    doc.registerFont('r', FONT_REG);
    doc.registerFont('b', FONT_BOLD);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentW = right - left;

    // ── Заголовок ──
    doc.font('b').fontSize(18).fillColor(INK).text(report.title, left, doc.y);
    doc.font('r').fontSize(11).fillColor(MUTED).text(report.subtitle);
    const meta = [
      report.period?.label,
      report.generatedAt ? `Сформировано: ${new Date(report.generatedAt).toLocaleString('ru-RU')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (meta) doc.fontSize(9).fillColor(MUTED).text(meta);
    doc.moveDown(0.8);

    // ── Кольцевая диаграмма (по центру) ──
    if (report.segments.length) {
      const png = renderDonutPng(report, { size: 420 });
      const imgW = 200;
      const y = doc.y;
      doc.image(png, left + (contentW - imgW) / 2, y, { width: imgW });
      doc.y = y + imgW + 14;
    }

    // ── Таблица данных ──
    const cValue = right - 150;
    const cShare = right - 60;
    let y = doc.y;
    doc.rect(left, y, contentW, 20).fill(HEAD_BG);
    doc.font('b').fontSize(10).fillColor('#FFFFFF');
    doc.text('Категория', left + 22, y + 5);
    doc.text(report.unit === '%' ? 'Риск, %' : 'Кол-во', cValue, y + 5, { width: 80, align: 'right' });
    doc.text('Доля, %', cShare, y + 5, { width: 52, align: 'right' });
    y += 24;

    doc.font('r').fontSize(10);
    for (const s of report.segments) {
      doc.rect(left + 2, y + 2, 12, 12).fill(s.color);
      doc.fillColor(INK).text(s.label, left + 22, y + 2, { width: cValue - left - 30 });
      doc.text(String(s.value), cValue, y + 2, { width: 80, align: 'right' });
      doc.text(String(s.share), cShare, y + 2, { width: 52, align: 'right' });
      y += 20;
    }
    doc.y = y + 6;

    // ── Динамика (векторный линейный график) ──
    if (report.trend && report.trend.points.length > 1) {
      drawTrend(doc, report.trend, left, doc.y, contentW, 150);
    }

    // ── Комплаенс-подвал ──
    doc.font('r').fontSize(8).fillColor(MUTED);
    doc.text(
      'Документ содержит персональные данные (ПДн) и медицинскую информацию. Обработка, хранение и ' +
        'передача — в соответствии с ФЗ-152 и Приказом Минздрава №965н. Не является врачебным заключением. ' +
        'Доступ и выгрузка зафиксированы в аудит-журнале организации.',
      left,
      doc.page.height - doc.page.margins.bottom - 34,
      { width: contentW, align: 'left' },
    );

    doc.end();
  });
}

/** Векторный линейный график динамики. */
function drawTrend(
  doc: PDFKit.PDFDocument,
  trend: TrendSeries,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.font('b').fontSize(11).fillColor(INK).text(trend.title, x, y);
  const top = y + 20;
  const plotH = h - 40;
  const bottom = top + plotH;
  const vals = trend.points.map((p) => p.value);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const n = trend.points.length;
  const px = (i: number) => x + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const py = (v: number) => bottom - ((v - min) / span) * plotH;

  // Оси
  doc.strokeColor('#D5D9E3').lineWidth(1);
  doc.moveTo(x, bottom).lineTo(x + w, bottom).stroke();

  // Линия
  doc.strokeColor(trend.color).lineWidth(2);
  trend.points.forEach((p, i) => {
    const cx = px(i);
    const cy = py(p.value);
    if (i === 0) doc.moveTo(cx, cy);
    else doc.lineTo(cx, cy);
  });
  doc.stroke();

  // Точки + подписи концов
  doc.fillColor(trend.color);
  trend.points.forEach((p, i) => doc.circle(px(i), py(p.value), 2.5).fill(trend.color));
  doc.font('r').fontSize(8).fillColor(MUTED);
  doc.text(`${trend.points[0]!.date}`, x, bottom + 4);
  doc.text(`${trend.points[n - 1]!.date}`, x + w - 60, bottom + 4, { width: 60, align: 'right' });
  doc.text(`макс ${max}${trend.unit}`, x, top - 2);
  doc.y = bottom + 24;
}
