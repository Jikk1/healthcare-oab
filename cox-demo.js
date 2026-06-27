/* ============================================================
   Демонстрация модели Кокса (cox-demo.html)
   ============================================================
   Берёт живой результат с /v1/cox/demo, а при недоступности API —
   встроенный снапшот (cox-demo.json), сгенерированный тем же сервисом.
   Рисует: KPI, forest-plot HR, кривые выживания, калибровку, тест
   пропорциональности (Schoenfeld) и горизонты выживаемости.
   ============================================================ */
import Chart from 'chart.js/auto';
import snapshot from './cox-demo.json';

const C = {
  teal: '#2dd4bf', tealBright: '#5eead4', sky: '#38bdf8', rose: '#ff5e7e',
  text2: '#aebfd4', text3: '#6f83a0', grid: 'rgba(255,255,255,0.07)',
};
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : v);

/* ---------- Источник данных: API → снапшот ---------- */
function apiBase() {
  if (window.HC_CONFIG && window.HC_CONFIG.apiBase) return String(window.HC_CONFIG.apiBase).replace(/\/+$/, '');
  if (import.meta.env && import.meta.env.VITE_API_BASE) return String(import.meta.env.VITE_API_BASE).replace(/\/+$/, '');
  const el = document.querySelector('meta[name="hc-api-base"]');
  return el && el.content ? el.content.replace(/\/+$/, '') : 'http://localhost:8080';
}

async function loadData() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${apiBase()}/v1/cox/demo`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('http ' + res.status);
    const json = await res.json();
    return { data: json.data ?? json, live: true };
  } catch {
    return { data: snapshot, live: false };
  }
}

/* ---------- Рендеры ---------- */
function renderStatus(live) {
  const dot = $('status').querySelector('.dot');
  dot.className = 'dot ' + (live ? 'live' : 'snap');
  $('statusText').textContent = live
    ? 'источник: живой расчёт сервера /v1/cox/demo'
    : 'источник: встроенный снапшот (сервер недоступен)';
}

function renderKpis(r) {
  const kpis = [
    { v: fmt(r.cIndex, 3), l: 'C-index (конкордантность)' },
    { v: r.n, l: 'Наблюдений' },
    { v: r.events, l: 'Событий' },
    { v: fmt(r.logLikelihood, 1), l: 'Log-правдоподобие' },
    { v: r.converged ? '✓' : '✗', l: `Сходимость · ${r.iterations} итер.` },
  ];
  $('kpis').innerHTML = kpis.map((k) => `<div class="cox-kpi"><div class="v">${k.v}</div><div class="l">${k.l}</div></div>`).join('');
}

function renderForest(r) {
  // Лог-шкала по объединённому диапазону ДИ всех коэффициентов (+ запас).
  const los = r.coefficients.map((c) => c.ci95[0]);
  const his = r.coefficients.map((c) => c.ci95[1]);
  const min = Math.min(0.9, ...los);
  const max = Math.max(1.1, ...his);
  const lmin = Math.log(min);
  const lmax = Math.log(max);
  const pos = (v) => ((Math.log(v) - lmin) / (lmax - lmin)) * 100;

  $('forest').innerHTML = r.coefficients
    .map((c) => {
      const left = pos(c.ci95[0]);
      const right = pos(c.ci95[1]);
      const dot = pos(c.hazardRatio);
      const sig = c.pValue < 0.05;
      return `<div class="forest-row">
        <div class="nm">${c.name}</div>
        <div class="hr-track">
          <div class="hr-ref" style="left:${pos(1)}%"><span>1.0</span></div>
          <div class="hr-ci" style="left:${left}%;width:${Math.max(0, right - left)}%"></div>
          <div class="hr-dot" style="left:${dot}%"></div>
        </div>
        <div class="hr-val"><b>HR ${fmt(c.hazardRatio, 2)}</b><br>${fmt(c.ci95[0], 2)}–${fmt(c.ci95[1], 2)} · p${sig ? '<0.05' : '=' + fmt(c.pValue, 2)}</div>
      </div>`;
    })
    .join('');
}

function renderSurvival(r) {
  const palette = [C.tealBright, C.sky, C.rose];
  const datasets = r.survival.map((s, i) => ({
    label: s.label,
    data: s.curve.map((p) => ({ x: p.t, y: p.survival })),
    borderColor: palette[i % palette.length],
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    tension: 0.25,
    pointRadius: 0,
  }));
  new Chart($('survivalChart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { labels: { color: C.text2, usePointStyle: true, padding: 14 } } },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Время (годы)', color: C.text3 }, grid: { color: C.grid }, ticks: { color: C.text3 } },
        y: { min: 0, max: 1, title: { display: true, text: 'S(t)', color: C.text3 }, grid: { color: C.grid }, ticks: { color: C.text3 } },
      },
    },
  });
}

function renderCalibration(r) {
  const pts = r.calibration.map((b) => ({ x: b.predicted, y: b.observed }));
  new Chart($('calibrationChart'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Бины', data: pts, borderColor: C.teal, backgroundColor: C.tealBright, pointRadius: 6 },
        { label: 'Идеал', type: 'line', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], borderColor: C.text3, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: C.text2, usePointStyle: true, padding: 14 } } },
      scales: {
        x: { min: 0, max: 1, title: { display: true, text: 'Предсказано', color: C.text3 }, grid: { color: C.grid }, ticks: { color: C.text3 } },
        y: { min: 0, max: 1, title: { display: true, text: 'Наблюдалось', color: C.text3 }, grid: { color: C.grid }, ticks: { color: C.text3 } },
      },
    },
  });
}

function renderPH(r) {
  const rows = r.phTest.perCovariate
    .map(
      (c) => `<tr>
        <td class="nm">${c.name}</td>
        <td>${fmt(c.correlation, 3)}</td>
        <td>${fmt(c.pValue, 3)}</td>
        <td><span class="badge ${c.violated ? 'bad' : 'ok'}">${c.violated ? 'нарушено' : 'выполняется'}</span></td>
      </tr>`,
    )
    .join('');
  $('phTable').innerHTML = `<thead><tr><th>Ковариата</th><th>Корреляция со временем</th><th>p-value</th><th>Пропорциональность</th></tr></thead><tbody>${rows}</tbody>`;
  $('phRec').textContent = r.phTest.recommendation;
}

function renderHorizons(r) {
  $('horizons').innerHTML = r.survival
    .map(
      (s) => `<div style="margin-bottom:14px">
        <div style="font-size:0.9rem;margin-bottom:8px;color:var(--text)">${s.label}</div>
        <div class="horizons">
          ${s.horizons.map((h) => `<div class="horizon-card"><div class="hv">${Math.round(h.survival * 100)}%</div><div class="hl">${h.label}</div></div>`).join('')}
        </div>
      </div>`,
    )
    .join('');
}

/* ---------- Старт ---------- */
async function init() {
  const { data, live } = await loadData();
  renderStatus(live);
  renderKpis(data);
  renderForest(data);
  renderSurvival(data);
  renderCalibration(data);
  renderPH(data);
  renderHorizons(data);
}

init();
