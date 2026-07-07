/* ============================================================
   HealthCareOAB+ — DonutStatsChart (Vanilla + Chart.js)
   ------------------------------------------------------------
   Переиспользуемый компонент кольцевой диаграммы из ТЗ (там он описан как
   React <DonutStatsChart data title />; проект — Vanilla+Chart.js, поэтому
   реализован как функция над <canvas>). Требования ТЗ выполнены:
     • цифровые подписи на самой диаграмме (значение и доля %),
     • легенда с названиями категорий,
     • всплывающая подсказка (tooltip) при наведении,
     • заголовок и итог в центре кольца.

   Контракт данных — тот же DonutReport, что отдаёт бэкенд (/v1/reports/*):
     { title, subtitle, centerValue, unit, segments:[{label,value,share,color}] }

   Требует window.Chart (подаётся vendor-chart.js). Возвращает Chart-инстанс.
   ============================================================ */

const FONT = "'Inter Variable', Inter, system-ui, -apple-system, sans-serif";

export function renderDonutStats(canvas, report) {
  if (!canvas || !window.Chart || !report) return null;
  const segs = (report.segments || []).filter((s) => Number(s.value) > 0);

  // Плагин: значение в центре + цифровые подписи на дугах (ТЗ).
  const labelsPlugin = {
    id: 'donutStatsLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const area = chart.chartArea;
      const cx = (area.left + area.right) / 2;
      const cy = (area.top + area.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Центр: итог + единица.
      ctx.fillStyle = '#EAF0FA';
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText(String(report.centerValue ?? ''), cx, cy - 5);
      if (report.unit) {
        ctx.fillStyle = '#6B7489';
        ctx.font = `500 11px ${FONT}`;
        ctx.fillText(report.unit, cx, cy + 16);
      }

      // Подписи на дугах: значение + доля (только если сектор достаточно велик).
      meta.data.forEach((arc, i) => {
        const s = segs[i];
        if (!s) return;
        if (arc.endAngle - arc.startAngle < 0.32) return;
        const ang = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(ang) * r;
        const y = arc.y + Math.sin(ang) * r;
        ctx.fillStyle = '#04121A';
        ctx.font = `700 12px ${FONT}`;
        ctx.fillText(String(s.value), x, y - 6);
        ctx.font = `600 10px ${FONT}`;
        ctx.fillText(`${s.share}%`, x, y + 7);
      });
      ctx.restore();
    },
  };

  return new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: segs.map((s) => s.label),
      datasets: [
        {
          data: segs.map((s) => s.value),
          backgroundColor: segs.map((s) => s.color),
          borderColor: 'rgba(9,12,24,0.85)',
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      layout: { padding: 6 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#A6AFC4', padding: 14, usePointStyle: true, font: { family: FONT } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const s = segs[ctx.dataIndex];
              return s ? ` ${s.label}: ${s.value} (${s.share}%)` : '';
            },
          },
        },
        title: report.title
          ? { display: true, text: report.title, color: '#EAF0FA', font: { size: 14, weight: '600', family: FONT } }
          : { display: false },
      },
    },
    plugins: [labelsPlugin],
  });
}

/**
 * Линейный график «динамика показателей во времени» (ТЗ, п.9 — динамика).
 * Контракт — TrendSeries бэкенда: { title, unit, color, points:[{date,value}] }.
 * Возвращает Chart-инстанс или null.
 */
export function renderTrendLine(canvas, trend) {
  if (!canvas || !window.Chart || !trend || !(trend.points || []).length) return null;
  const color = trend.color || '#00E5FF';
  const unit = trend.unit || '';
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: trend.points.map((p) => p.date),
      datasets: [
        {
          data: trend.points.map((p) => p.value),
          borderColor: color,
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return color + '22';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, color + '55');
            g.addColorStop(1, color + '00');
            return g;
          },
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: trend.title
          ? { display: true, text: trend.title, color: '#EAF0FA', font: { size: 13, weight: '600', family: FONT } }
          : { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y}${unit}` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#6B7489', callback: (v) => v + unit, font: { family: FONT } },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        x: {
          ticks: { color: '#6B7489', maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { family: FONT } },
          grid: { display: false },
        },
      },
    },
  });
}
