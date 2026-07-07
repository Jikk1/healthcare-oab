import ExcelJS from 'exceljs';
import type { DonutReport } from './reports.domain.js';
import { renderDonutPng } from './donut-image.js';

/**
 * Собирает .xlsx-отчёт: таблица с исходными числами (со «свотчами» цветов
 * сегментов) + встроенная PNG-картинка кольцевой диаграммы (см. donut-image.ts).
 */
export async function buildReportWorkbook(report: DonutReport): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HealthCareOAB+';
  wb.created = new Date();

  const ws = wb.addWorksheet('Отчёт', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 3 }, // A — свотч цвета
    { width: 26 }, // B — категория
    { width: 14 }, // C — значение
    { width: 12 }, // D — доля
  ];

  // Заголовок
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = report.title;
  ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF0F1424' } };
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = report.subtitle;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF6B7489' } };

  const meta = [
    report.period?.label,
    report.generatedAt ? `Сформировано: ${new Date(report.generatedAt).toLocaleString('ru-RU')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (meta) {
    ws.mergeCells('A3:D3');
    ws.getCell('A3').value = meta;
    ws.getCell('A3').font = { size: 9, color: { argb: 'FF6B7489' } };
  }

  // Шапка таблицы (строка 4)
  const valueHeader = report.unit === '%' ? 'Риск, %' : 'Количество';
  const head = ['', 'Категория', valueHeader, 'Доля, %'];
  const hr = ws.getRow(4);
  head.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1424' } };
    c.alignment = { vertical: 'middle' };
  });

  // Строки данных
  report.segments.forEach((s, idx) => {
    const r = ws.getRow(5 + idx);
    r.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + s.color.replace('#', '') },
    };
    r.getCell(2).value = s.label;
    r.getCell(3).value = s.value;
    r.getCell(4).value = s.share;
    r.getCell(4).numFmt = '0.0';
  });

  // Итоговая строка
  const totalRow = ws.getRow(5 + report.segments.length + 1);
  totalRow.getCell(2).value = 'Итого';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = report.segments.reduce((a, s) => a + s.value, 0);
  totalRow.getCell(3).font = { bold: true };

  // Встроенная диаграмма (PNG справа от таблицы)
  const png = renderDonutPng(report, { size: 420 });
  // `as never`: обход расхождения дженерика Buffer (@types/node vs типы exceljs).
  const imgId = wb.addImage({ buffer: png as never, extension: 'png' });
  ws.addImage(imgId, {
    tl: { col: 4.3, row: 0.4 },
    ext: { width: 300, height: 300 },
    editAs: 'oneCell',
  });

  // Динамика показателей во времени (таблица) — если есть.
  let row = 5 + report.segments.length + 3;
  if (report.trend && report.trend.points.length) {
    ws.getCell(`A${row}`).value = report.trend.title;
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 1;
    const th = ws.getRow(row);
    ['', 'Период', `Значение, ${report.trend.unit}`].forEach((h, i) => {
      const c = th.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1424' } };
    });
    row += 1;
    for (const p of report.trend.points) {
      const r = ws.getRow(row);
      r.getCell(2).value = p.date;
      r.getCell(3).value = p.value;
      r.getCell(3).numFmt = '0.0';
      row += 1;
    }
    row += 1;
  }

  // Комплаенс-подвал (ПДн).
  ws.mergeCells(`A${row}:H${row + 1}`);
  const note = ws.getCell(`A${row}`);
  note.value =
    'Документ содержит персональные данные (ПДн) и медицинскую информацию. Обработка, хранение и передача — ' +
    'согласно ФЗ-152 и Приказу Минздрава №965н. Не является врачебным заключением. Доступ и выгрузка ' +
    'зафиксированы в аудит-журнале организации.';
  note.font = { size: 8, color: { argb: 'FF6B7489' }, italic: true };
  note.alignment = { wrapText: true, vertical: 'top' };

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
