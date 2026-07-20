/* ============================================================
   HealthCareOAB+ — Общие рендеры результата OmniRisk
   ============================================================
   labs.html и predict.html показывают один и тот же OmniRiskResult
   (KPI, список болезней, фильтр категорий, радар цифрового двойника).
   Раньше эти рендеры были скопированы в labs.js и predict.js; здесь —
   единственная копия разметки/логики. Страницы остаются владельцами
   состояния (горизонт/категория/выбранная болезнь) и передают его сюда
   параметрами, а различия оформления — через опции (clickable/ciLabel/…).
   Разметка использует data-sty (CSP: без style-src 'unsafe-inline') —
   стили применяет observeDynamicStyles() из lib/dom.js на каждой странице.
   UI-строки локализуются через t() (RU — источник); имена болезней,
   категорий и систем — данные движка, остаются RU (см. ADR-0008).
   ============================================================ */
import { t } from './i18n.js';

export const COLORS = {
  low: '#4AFFAA', medium: '#FFB547', high: '#FF8A5B', critical: '#FF5E7E',
  cyan: '#00E5FF', mint: '#4AFFAA', violet: '#A78BFA', rose: '#FF5E7E', amber: '#FFB547',
};
export const levelColor = (lvl) => COLORS[lvl.toLowerCase()] || COLORS.cyan;
export const levelLabel = { LOW: 'Низкий', MEDIUM: 'Умеренный', HIGH: 'Высокий', CRITICAL: 'Критический' };
/** Уровень риска на языке интерфейса (RU — источник в levelLabel). */
export const levelText = (lvl) => t('orj.level.' + lvl, levelLabel[lvl] ?? lvl);
export const riskColor = (p) => (p < 8 ? COLORS.mint : p < 20 ? COLORS.amber : p < 40 ? COLORS.high : COLORS.rose);

/** Вероятность/ДИ болезни на заданном горизонте (годы или 'lifetime'). */
export const probAt = (p, h) => { const x = p.horizons.find((hh) => String(hh.years) === String(h)); return x ? x.probability : 0; };
export const ciAt = (p, h) => { const x = p.horizons.find((hh) => String(hh.years) === String(h)); return x ? x.ci : [0, 0]; };

/** Подсветить активную кнопку в сегмент-контроле. */
export function syncSeg(containerId, dataKey, value) {
  document.querySelectorAll(`#${containerId} button`).forEach((b) => b.classList.toggle('active', b.dataset[dataKey] === value));
}

/** Рендер плитки KPI. Массив строит страница (наборы KPI различаются). */
export function renderKpis(el, kpis) {
  el.innerHTML = kpis.map((k) => `
      <div class="or-kpi">
        <div class="v" data-sty="color:${k.color}">${k.v}</div>
        <div class="l">${k.l}</div>
        ${k.hint ? `<div class="hint">${k.hint}</div>` : ''}
      </div>`).join('');
}

/** Чипы фильтра категорий. onSelect(cat) вызывается по клику. */
export function renderCatFilter(el, r, categoryLabels, current, onSelect) {
  const cats = [...new Set(r.predictions.map((p) => p.category))];
  const chips = ['<button data-cat="all" class="' + (current === 'all' ? 'active' : '') + '">' + t('orj.chips.all', 'Все') + '</button>']
    .concat(cats.map((c) => `<button data-cat="${c}" class="${current === c ? 'active' : ''}">${categoryLabels[c]}</button>`));
  el.innerHTML = chips.join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onSelect(b.dataset.cat)));
}

const HORIZON_LABELS = { '1': '1 год', '3': '3 года', '5': '5 лет', '10': '10 лет', '20': '20 лет', lifetime: 'пожизненно' };
const horizonText = (h) => t('orj.horizon.' + h, HORIZON_LABELS[h]);

/** Список болезней, отсортированный по риску на горизонте.
 *  opts: { horizon, category, categoryLabels, horizonLabelEl,
 *          clickable, ciLabel, badgeExtra, onSelect }.
 *  clickable=true → строки с data-disease + курсор + onSelect(id). */
export function renderDiseases(el, r, {
  horizon, category, categoryLabels, horizonLabelEl,
  clickable = false, ciLabel = 'CI', badgeExtra = '', onSelect,
} = {}) {
  if (!r) return;
  if (horizonLabelEl) horizonLabelEl.textContent = '· ' + horizonText(horizon);
  let list = r.predictions.slice();
  if (category && category !== 'all') list = list.filter((p) => p.category === category);
  list.sort((a, b) => probAt(b, horizon) - probAt(a, horizon));
  el.innerHTML = list.map((p) => {
    const prob = probAt(p, horizon), ci = ciAt(p, horizon), col = levelColor(p.riskLevel);
    const onset = p.onsetAgeEstimate ? `${t('orj.onset', 'дебют')} ~${p.onsetAgeEstimate} ${t('orj.onsetYears', 'лет')} · ` : '';
    const rowAttr = clickable ? ` data-disease="${p.id}" data-sty="cursor:pointer"` : '';
    return `<div class="or-disease"${rowAttr}>
        <div>
          <div class="nm">${p.name} <span class="risk-badge" data-sty="background:${col}22;color:${col};border:1px solid ${col}55${badgeExtra}">${levelText(p.riskLevel)}</span></div>
          <div class="meta">${p.icd11} · ${categoryLabels[p.category]} · ${onset}RR ${p.relativeRisk}× · ${ciLabel} ${ci[0]}–${ci[1]}%</div>
        </div>
        <div class="or-prob" data-sty="color:${riskColor(prob)}">${prob}%</div>
        <div class="or-bar"><i data-sty="width:${Math.min(100, prob)}%;background:${riskColor(prob)}"></i></div>
      </div>`;
  }).join('');
  if (clickable && onSelect) {
    el.querySelectorAll('.or-disease').forEach((row) => row.addEventListener('click', () => onSelect(row.dataset.disease)));
  }
}

/** Радар «цифрового двойника» (индекс здоровья систем). charts — кэш
 *  инстансов Chart на странице; при повторном вызове обновляет данные. */
export function renderTwinRadar(charts, canvasEl, r) {
  const cur = r.digitalTwin.current;
  const data = {
    labels: cur.map((s) => s.label),
    datasets: [{ label: t('orj.kpi.health', 'Индекс здоровья'), data: cur.map((s) => s.health), borderColor: COLORS.cyan, backgroundColor: 'rgba(0,229,255,0.18)', pointBackgroundColor: COLORS.cyan, pointBorderColor: '#04121A', pointBorderWidth: 2 }],
  };
  if (charts.radar) { charts.radar.data = data; charts.radar.update('none'); return; }
  charts.radar = new window.Chart(canvasEl, {
    type: 'radar', data,
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.08)' }, angleLines: { color: 'rgba(255,255,255,0.08)' }, pointLabels: { color: '#A6AFC4', font: { size: 11 } } } } },
  });
}
