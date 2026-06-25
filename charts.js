/* ============================================================
   HealthCareOAB+ — Chart palette & helpers
   (consumed by dashboard.js)
   ============================================================ */
'use strict';

window.Ariadna = window.Ariadna || {};

window.Ariadna.COLORS = {
  cyan:   '#00E5FF',
  mint:   '#4AFFAA',
  amber:  '#FFB547',
  rose:   '#FF5E7E',
  violet: '#A78BFA',
  muted:  '#6B7489',
  text:   '#EAF0FA',
  text2:  '#A6AFC4',
  bg:     '#090C18',
  border: 'rgba(255, 255, 255, 0.08)',
};

window.Ariadna.riskColor = (p) => {
  if (p < 20) return window.Ariadna.COLORS.mint;
  if (p < 45) return window.Ariadna.COLORS.amber;
  if (p < 65) return '#FF8A5B';
  return window.Ariadna.COLORS.rose;
};

/* Build a linear vertical gradient for Chart.js area fills */
window.Ariadna.areaGradient = (ctx, color, stopAlpha = 0.35) => {
  if (!ctx) return color;
  const chartArea = ctx.chart?.chartArea;
  if (!chartArea) return color;
  const g = ctx.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  const hexToRgb = (h) => {
    const v = h.replace('#','');
    return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
  };
  const [r, gr, b] = hexToRgb(color);
  g.addColorStop(0, `rgba(${r},${gr},${b},${stopAlpha})`);
  g.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  return g;
};

/* Common Chart.js defaults */
window.Ariadna.applyChartDefaults = () => {
  if (!window.Chart) return;
  const C = window.Ariadna.COLORS;
  Chart.defaults.font.family = "'Inter', 'DM Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = C.text2;
  Chart.defaults.borderColor = C.border;
  Chart.defaults.plugins.legend.labels.color = C.text2;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(5, 7, 15, 0.95)';
  Chart.defaults.plugins.tooltip.titleColor = C.text;
  Chart.defaults.plugins.tooltip.bodyColor = C.text2;
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.14)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.boxPadding = 6;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12.5 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12, family: "'JetBrains Mono', monospace" };
  Chart.defaults.elements.line.tension = 0.35;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hoverBorderWidth = 2;
};

/* Simple sparkline renderer (lightweight SVG, used on KPI cards) */
window.Ariadna.sparkline = (el, values, color) => {
  if (!el) return;
  color = color || window.Ariadna.COLORS.cyan;
  const w = 120, h = 34, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const dArea = `${d} L${w - pad},${h - pad} L${pad},${h - pad} Z`;
  const id = 'spk' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${color}" stop-opacity="0.45"/>
          <stop offset="1" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${dArea}" fill="url(#${id})" />
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="2.2" fill="${color}"/>
    </svg>`;
};

/* Radar dataset factory (for Chart.js) */
window.Ariadna.radarDataset = (label, values, color) => ({
  label,
  data: values,
  borderColor: color,
  backgroundColor: color.replace(')', ', 0.18)').replace('rgb', 'rgba'),
  pointBackgroundColor: color,
  pointBorderColor: '#04121A',
  pointBorderWidth: 2,
  borderWidth: 2,
  fill: true,
});
