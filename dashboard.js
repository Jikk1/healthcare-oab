/* ============================================================
   HealthCareOAB+ — Dashboard logic
   ============================================================ */
(() => {
  'use strict';

  const A = window.Ariadna || {};
  const C = A.COLORS || {};
  if (A.applyChartDefaults) A.applyChartDefaults();

  /* ---------- Synthetic patients dataset (fallback / демо-режим) ---------- */
  const DEMO_PATIENTS = [
    { id:'P-00142', name:'Морозов Владимир К.',  initials:'МК', sex:'Муж', age:58, cv:34.2, dm:18.6, bio:64, level:'critical' },
    { id:'P-00089', name:'Серебрякова Ирина А.', initials:'СИ', sex:'Жен', age:52, cv:28.9, dm:22.1, bio:58, level:'critical' },
    { id:'P-00217', name:'Кузнецов Артём В.',    initials:'КА', sex:'Муж', age:61, cv:26.4, dm:14.2, bio:65, level:'high' },
    { id:'P-00305', name:'Воронова Татьяна И.',  initials:'ВТ', sex:'Жен', age:47, cv:19.8, dm:16.7, bio:51, level:'high' },
    { id:'P-00412', name:'Белов Николай Д.',     initials:'БН', sex:'Муж', age:55, cv:21.2, dm:11.3, bio:59, level:'high' },
    { id:'P-00523', name:'Литвинова Ольга П.',   initials:'ЛО', sex:'Жен', age:44, cv:12.6, dm:9.8,  bio:46, level:'medium' },
    { id:'P-00677', name:'Гусев Дмитрий М.',     initials:'ГД', sex:'Муж', age:49, cv:14.3, dm:8.4,  bio:50, level:'medium' },
    { id:'P-00712', name:'Новикова Анна С.',     initials:'НА', sex:'Жен', age:39, cv:8.2,  dm:6.1,  bio:37, level:'low' },
    { id:'P-00804', name:'Федоров Игорь А.',     initials:'ФИ', sex:'Муж', age:42, cv:9.5,  dm:7.3,  bio:41, level:'low' },
    { id:'P-00916', name:'Рыбакова Елена В.',    initials:'РЕ', sex:'Жен', age:36, cv:5.8,  dm:4.4,  bio:34, level:'low' },
  ];

  // Активный набор. Стартует на демо-данных, заменяется живыми из API при входе.
  let PATIENTS = DEMO_PATIENTS;

  // Распределение по уровням риска [низкий, умеренный, высокий, критический].
  // Демо-значения; заменяются агрегатом из /v1/analytics/risk-distribution.
  let riskDistData = [812, 286, 126, 23];

  const levelLabel = { critical: 'Критический', high: 'Высокий', medium: 'Умеренный', low: 'Низкий' };
  const levelClass = { critical: 'risk-critical', high: 'risk-high', medium: 'risk-medium', low: 'risk-low' };

  /* ---------- Elements ---------- */
  const overviewBody = document.getElementById('overviewTableBody');
  const patientsBody = document.getElementById('patientsTableBody');
  const topbarTitle = document.getElementById('topbarTitle');
  const recList = document.getElementById('recList');
  const riskSummaryList = document.getElementById('riskSummaryList');

  /* ---------- Sidebar toggle ---------- */
  window.toggleSidebar = () => {
    document.querySelector('.app-layout')?.classList.toggle('collapsed');
  };

  /* ---------- Page switcher ---------- */
  const PAGE_TITLES = {
    overview: 'Дашборд',
    patients: 'Пациенты',
    profile: 'Профиль риска · Морозов В.К.',
    scenario: 'Сценарное моделирование',
    recommendations: 'План вмешательств',
    population: 'Популяционная аналитика',
  };
  window.switchPage = (page) => {
    document.querySelectorAll('.page-panel').forEach((el) => el.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    const matches = [...document.querySelectorAll('.nav-item')].filter((el) => el.getAttribute('onclick')?.includes("'" + page + "'"));
    matches.forEach((m) => m.classList.add('active'));
    if (topbarTitle) topbarTitle.textContent = PAGE_TITLES[page] || 'Дашборд';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------- Toast ---------- */
  const toastWrap = document.getElementById('toastContainerDB');
  window.showToastDB = (title, msg, type = 'info') => {
    if (!toastWrap) return;
    const t = document.createElement('div');
    t.className = 'toast-item ' + type;
    t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>`;
    toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; t.style.transition = 'all 0.3s'; }, 4200);
    setTimeout(() => t.remove(), 4700);
  };

  window.refreshData = () => {
    const api = window.HCApi;
    if (api && api.isAuthenticated()) {
      loadRealPatients()
        .then((n) => window.showToastDB('Обновлено', `Список пациентов получен из API · ${n} карт`, 'success'))
        .catch(() => window.showToastDB('Ошибка', 'Не удалось обновить данные из API', 'alert'));
    } else {
      window.showToastDB('Обновление данных', 'Демо-режим · синтетические данные', 'info');
    }
    renderTrend();
  };
  // Topbar global search: jump to the patients page and apply the query there,
  // reusing the existing filter/search pipeline so results stay consistent.
  window.handleSearch = (v) => {
    const q = (v || '').trim();
    if (!q) return;
    window.switchPage('patients');
    const box = document.getElementById('patientSearch');
    if (box) box.value = q;
    window.searchPatients(q);
  };

  /* ---------- Patient table rendering ---------- */
  // Живые данные могут не иметь оценки риска → cv/dm/bio === null. Рендер должен это пережить.
  const fmtPct = (v) => (v == null ? '—' : v.toFixed(1) + '%');
  const riskCol = (v) => (v == null ? 'var(--text-3)' : A.riskColor(v));
  const bioOverviewCell = (p) =>
    p.bio == null
      ? '—'
      : `${p.bio} <span style="color:var(--amber);font-family:var(--font-mono);font-size:11px">+${p.bio - p.age}</span>`;
  const bioFullCell = (p) =>
    p.bio == null
      ? '—'
      : `${p.bio} <span style="color:var(--text-3);font-family:var(--font-mono);font-size:11px">/${p.age}</span>`;

  const patientRow = (p, mode = 'full') => {
    const lvlClass = levelClass[p.level] || 'risk-low';
    const tr = document.createElement('tr');
    tr.onclick = () => window.switchPage('profile');
    if (mode === 'overview') {
      tr.innerHTML = `
        <td><div class="p-avatar"><div class="ava">${p.initials}</div><div><div style="font-weight:500;font-size:13px">${p.name}</div><div style="font-size:11px;color:var(--text-3)">${p.id}</div></div></div></td>
        <td>${p.age}</td>
        <td><strong style="font-family:var(--font-mono);color:${riskCol(p.cv)}">${fmtPct(p.cv)}</strong></td>
        <td>${bioOverviewCell(p)}</td>
        <td><span class="risk-badge ${lvlClass}">${levelLabel[p.level] || p.level}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();switchPage('profile')">Открыть →</button></td>`;
    } else {
      tr.innerHTML = `
        <td><div class="p-avatar"><div class="ava">${p.initials}</div><div><div style="font-weight:500;font-size:13px">${p.name}</div><div style="font-size:11px;color:var(--text-3)">${p.id}</div></div></div></td>
        <td>${p.sex} · ${p.age}</td>
        <td><span style="font-family:var(--font-mono);color:${riskCol(p.cv)}">${fmtPct(p.cv)}</span></td>
        <td><span style="font-family:var(--font-mono);color:${riskCol(p.dm)}">${fmtPct(p.dm)}</span></td>
        <td>${bioFullCell(p)}</td>
        <td><span class="risk-badge ${lvlClass}">${levelLabel[p.level] || p.level}</span></td>
        <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();switchPage('profile')">→</button></td>`;
    }
    return tr;
  };

  const renderOverviewTable = () => {
    if (!overviewBody) return;
    overviewBody.innerHTML = '';
    PATIENTS.filter((p) => ['critical','high'].includes(p.level)).slice(0, 5).forEach((p) => overviewBody.appendChild(patientRow(p, 'overview')));
  };

  const renderPatientTable = (filter = 'all', query = '') => {
    if (!patientsBody) return;
    patientsBody.innerHTML = '';
    let rows = PATIENTS;
    if (filter !== 'all') rows = rows.filter((p) => p.level === filter);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    if (!rows.length) {
      patientsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-3)">Пациенты не найдены</td></tr>`;
      return;
    }
    rows.forEach((p) => patientsBody.appendChild(patientRow(p, 'full')));
  };

  window.filterPatients = (level, el) => {
    document.querySelectorAll('#riskFilters .chip').forEach((c) => c.classList.remove('active'));
    el?.classList.add('active');
    const q = document.getElementById('patientSearch')?.value || '';
    renderPatientTable(level, q);
  };
  window.searchPatients = (v) => {
    const active = document.querySelector('#riskFilters .chip.active');
    const filter = active?.textContent?.trim().toLowerCase() || 'all';
    const map = { 'все':'all','критический':'critical','высокий':'high','умеренный':'medium','низкий':'low' };
    renderPatientTable(map[filter] || 'all', v);
  };

  /* ---------- Recommendations + risk summary ---------- */
  const RECS = [
    { icon:'💊', title:'Назначение статинов (аторвастатин 40 мг)', desc:'Снижение LDL с 4.8 до <2.6 ммоль/л · соответствие ESC 2021 для пациентов высокого риска', impact:'−14% ИМ', cls:'mint' },
    { icon:'🚭', title:'Программа отказа от курения', desc:'Консультация нарколога + никотин-заместительная терапия · 12-недельный протокол', impact:'−11% ИМ', cls:'mint' },
    { icon:'💓', title:'Контроль АД: периндоприл + амлодипин', desc:'Целевой диапазон 120–130/70–80 мм рт.ст. · мониторинг каждые 2 недели', impact:'−8% инсульт', cls:'amber' },
    { icon:'🏃', title:'Аэробная активность 150 мин/нед', desc:'Умеренная интенсивность · пульсовая зона 60–70% от максимума · 5 раз в неделю', impact:'−6% ССЗ', cls:'amber' },
    { icon:'🥗', title:'DASH-диета + Ω-3 жирные кислоты', desc:'Снижение натрия до 1500 мг/сут · EPA/DHA 2–4 г/сут из жирной рыбы или добавок', impact:'−4% ССЗ', cls:'amber' },
    { icon:'🩺', title:'Расширенная эхокардиография', desc:'Исключение субклинической ГЛЖ и диастолической дисфункции · в ближайшие 4 недели', impact:'Диагностика', cls:'' },
  ];
  const renderRecs = () => {
    if (!recList) return;
    recList.innerHTML = RECS.map((r) => `
      <div class="rec-card ${r.cls}">
        <div class="rec-ico">${r.icon}</div>
        <div>
          <div class="rec-title">${r.title}</div>
          <div class="rec-desc">${r.desc}</div>
        </div>
        <span class="rec-impact">${r.impact}</span>
      </div>`).join('');
  };

  const RISK_SUMMARY = [
    { name:'Инфаркт миокарда (10л)', value: 34.2, unit:'%', ci:'28.1–40.6' },
    { name:'Инсульт (10л)',          value: 22.1, unit:'%', ci:'17.8–26.9' },
    { name:'СД2 (10л)',              value: 18.6, unit:'%', ci:'14.2–23.1' },
    { name:'ХБП 3-й ст. (10л)',       value: 11.4, unit:'%', ci:'8.1–15.2' },
  ];
  const renderRiskSummary = () => {
    if (!riskSummaryList) return;
    riskSummaryList.innerHTML = RISK_SUMMARY.map((r) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,0.02)">
        <div>
          <div style="font-size:13px">${r.name}</div>
          <div style="font-size:11px;color:var(--text-3);font-family:var(--font-mono);margin-top:2px">CI: ${r.ci}${r.unit}</div>
        </div>
        <div style="font-family:var(--font-mono);font-weight:700;color:${A.riskColor(r.value)};font-size:16px">${r.value}${r.unit}</div>
      </div>`).join('');
  };

  /* ---------- Charts (Chart.js) ---------- */
  const charts = {};

  const renderTrend = (filter = 'all') => {
    const cnv = document.getElementById('trendChart');
    if (!cnv || !window.Chart) return;
    const labels = ['Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек','Янв'];
    const all = { ccs:[23,24,24,25,26,26,27,28,28,29,30,31], dm:[14,14,15,15,16,16,17,17,18,18,19,19], onco:[8,8,9,9,9,10,10,11,11,12,12,13] };
    const datasets = [];
    if (filter === 'all' || filter === 'cv')   datasets.push({ label:'ССЗ-риск',  data: all.ccs,  borderColor: C.rose, fill: true, backgroundColor: (ctx) => A.areaGradient(ctx, C.rose, 0.3) });
    if (filter === 'all' || filter === 'dm')   datasets.push({ label:'СД2-риск',  data: all.dm,   borderColor: C.amber, fill: true, backgroundColor: (ctx) => A.areaGradient(ctx, C.amber, 0.25) });
    if (filter === 'all' || filter === 'onco') datasets.push({ label:'Онко-риск', data: all.onco, borderColor: C.cyan,  fill: true, backgroundColor: (ctx) => A.areaGradient(ctx, C.cyan, 0.22) });

    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(cnv, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    });
  };

  const renderRiskDist = () => {
    const cnv = document.getElementById('riskDistChart');
    if (!cnv || !window.Chart) return;
    if (charts.riskDist) charts.riskDist.destroy();
    charts.riskDist = new Chart(cnv, {
      type: 'doughnut',
      data: {
        labels: ['Низкий', 'Умеренный', 'Высокий', 'Критический'],
        datasets: [{ data: riskDistData.slice(), backgroundColor: [C.mint, C.amber, '#FF8A5B', C.rose], borderColor: 'rgba(9,12,24,0.8)', borderWidth: 3, hoverOffset: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} пациентов` } },
        },
      },
    });
  };

  const renderRadar = () => {
    const cnv = document.getElementById('radarChart');
    if (!cnv || !window.Chart) return;
    if (charts.radar) charts.radar.destroy();
    charts.radar = new Chart(cnv, {
      type: 'radar',
      data: {
        labels: ['Сердце','Сосуды','Метаболизм','Почки','Мозг','Иммунитет','Печень','Лёгкие'],
        datasets: [
          { label:'Пациент', data: [82, 74, 58, 42, 66, 38, 35, 50], borderColor: C.rose, backgroundColor: 'rgba(255,94,126,0.22)', pointBackgroundColor: C.rose, pointBorderColor: '#04121A', pointBorderWidth: 2 },
          { label:'Норма',   data: [40, 38, 35, 30, 38, 28, 25, 32], borderColor: C.mint, backgroundColor: 'rgba(74,255,170,0.12)', pointBackgroundColor: C.mint, pointBorderColor: '#04121A', pointBorderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
        scales: {
          r: {
            beginAtZero: true, max: 100,
            ticks: { display: false, stepSize: 20 },
            grid: { color: 'rgba(255,255,255,0.08)' },
            angleLines: { color: 'rgba(255,255,255,0.08)' },
            pointLabels: { color: C.text2, font: { size: 11 } },
          },
        },
      },
    });
  };

  const renderTimeline = () => {
    const cnv = document.getElementById('timelineChart');
    if (!cnv || !window.Chart) return;
    if (charts.timeline) charts.timeline.destroy();
    charts.timeline = new Chart(cnv, {
      type: 'line',
      data: {
        labels: ['Сейчас','+1г','+2г','+3г','+4г','+5л','+6л','+7л','+8л','+9л','+10л'],
        datasets: [
          { label:'Без вмешательства', data: [34, 36, 38, 41, 44, 47, 50, 53, 56, 59, 62], borderColor: C.rose, backgroundColor: (ctx) => A.areaGradient(ctx, C.rose, 0.28), fill: true, borderDash: [] },
          { label:'При соблюдении',    data: [34, 31, 28, 25, 23, 21, 20, 19, 19, 18, 18], borderColor: C.mint, backgroundColor: (ctx) => A.areaGradient(ctx, C.mint, 0.22), fill: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
        scales: {
          y: { beginAtZero: true, max: 75, ticks: { callback: (v) => v + '%' } },
          x: { grid: { display: false } },
        },
      },
    });
  };

  const renderShap = () => {
    const el = document.getElementById('shapChart');
    if (!el) return;
    const data = [
      { f:'Возраст · 58 лет',      v:  7.2, imm:true },
      { f:'Курение · 25 пачко-лет', v:  6.8, imm:false },
      { f:'АД сист. · 158',        v:  5.1, imm:false },
      { f:'LDL · 4.8 ммоль/л',     v:  4.4, imm:false },
      { f:'Семейный анамнез ИМ',   v:  3.7, imm:true },
      { f:'ИМТ · 29.4',            v:  2.8, imm:false },
      { f:'Физ. активность',       v: -2.1, imm:false },
      { f:'HbA1c · 5.7%',          v: -0.8, imm:false },
    ];
    const max = Math.max(...data.map((d) => Math.abs(d.v)));
    el.innerHTML = data.map((d) => {
      const pos = d.v >= 0;
      const w = (Math.abs(d.v) / max) * 100;
      return `<div class="shap-row">
        <div class="shap-label">${d.f}${d.imm ? ' <span style="color:var(--text-3);font-size:10px">(немодиф.)</span>' : ''}</div>
        <div class="shap-track"><div class="shap-fill ${pos ? '' : 'neg'}" style="${pos ? `left:50%;width:${w/2}%` : `right:50%;width:${w/2}%`};"></div></div>
        <div class="shap-val">${pos ? '+' : ''}${d.v.toFixed(1)}</div>
      </div>`;
    }).join('');
  };

  /* ---------- Scenario simulator ---------- */
  const SCEN = { base: { im: 34.2, stroke: 22.1, dm: 18.6, bp: 158, ldl: 4.8, bmi: 29.4, smoking: 25, activity: 1 } };
  const current = { ...SCEN.base };

  window.updateScenario = (key, val) => {
    const v = parseFloat(val);
    if (key === 'bp') current.bp = v;
    if (key === 'ldl') current.ldl = v / 10;
    if (key === 'bmi') current.bmi = v / 10;
    if (key === 'smoking') current.smoking = v;
    if (key === 'activity') current.activity = v;

    const setText = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
    setText('bpVal', `${current.bp} мм рт.ст.`);
    setText('ldlVal', `${current.ldl.toFixed(1)} ммоль/л`);
    setText('bmiVal', `${current.bmi.toFixed(1)} кг/м²`);
    setText('smokingVal', `${current.smoking} п/л`);
    setText('activityVal', current.activity === 0 ? '0 (нет)' : `${current.activity} раз/нед`);

    setText('statBP', current.bp);
    setText('statLDL', current.ldl.toFixed(1));
    setText('statBMI', current.bmi.toFixed(1));
    setText('statActivity', current.activity + '×');

    /* Crude but monotonic clinical estimate */
    const bpEffect = Math.max(0, (current.bp - 120) * 0.12);
    const ldlEffect = Math.max(0, (current.ldl - 2.6) * 2.1);
    const bmiEffect = Math.max(0, (current.bmi - 25) * 0.35);
    const smokeEffect = current.smoking * 0.28;
    const activityEffect = -current.activity * 0.8;

    const factor = (bpEffect + ldlEffect + bmiEffect + smokeEffect + activityEffect) / (SCEN.base.bp * 0.12 - 120 * 0.12 + SCEN.base.ldl * 2.1 - 2.6 * 2.1 + SCEN.base.bmi * 0.35 - 25 * 0.35 + SCEN.base.smoking * 0.28 - 1 * 0.8);
    const k = Math.max(0.25, Math.min(1.5, factor));

    const newIm = Math.max(3, Math.min(80, SCEN.base.im * k));
    const newSt = Math.max(2, Math.min(70, SCEN.base.stroke * k));
    const newDm = Math.max(2, Math.min(65, SCEN.base.dm * (0.5 + k * 0.6)));
    const totalDelta = ((SCEN.base.im - newIm) / SCEN.base.im * 100);

    setText('scenImChange', `${SCEN.base.im.toFixed(1)}% → ${newIm.toFixed(1)}%`);
    setText('scenStroke',    `${SCEN.base.stroke.toFixed(1)}% → ${newSt.toFixed(1)}%`);
    setText('scenDm',        `${SCEN.base.dm.toFixed(1)}% → ${newDm.toFixed(1)}%`);
    const totalEl = document.getElementById('scenTotal');
    if (totalEl) {
      const sign = totalDelta >= 0 ? '−' : '+';
      totalEl.textContent = `${sign}${Math.abs(totalDelta).toFixed(1)}%`;
      totalEl.classList.toggle('change-positive', totalDelta >= 0);
      totalEl.classList.toggle('change-negative', totalDelta < 0);
    }
    const badge = document.getElementById('scenarioBadge');
    if (badge) {
      badge.classList.remove('risk-low','risk-medium','risk-high','risk-critical');
      let lvl = 'low', lbl = 'Низкий';
      if (newIm > 25) { lvl = 'critical'; lbl = 'Критический'; }
      else if (newIm > 15) { lvl = 'high'; lbl = 'Высокий'; }
      else if (newIm > 8) { lvl = 'medium'; lbl = 'Умеренный'; }
      badge.classList.add('risk-' + lvl);
      badge.textContent = lbl;
    }

    if (charts.scenario) {
      charts.scenario.data.datasets[1].data = [newIm, newSt, newDm];
      charts.scenario.update('none');
    }
  };

  const renderScenarioChart = () => {
    const cnv = document.getElementById('scenarioChart');
    if (!cnv || !window.Chart) return;
    if (charts.scenario) charts.scenario.destroy();
    charts.scenario = new Chart(cnv, {
      type: 'bar',
      data: {
        labels: ['ИМ', 'Инсульт', 'СД2'],
        datasets: [
          { label:'Текущий риск',   data:[SCEN.base.im, SCEN.base.stroke, SCEN.base.dm], backgroundColor: 'rgba(255,94,126,0.6)', borderRadius: 6 },
          { label:'Прогнозируемый', data:[SCEN.base.im, SCEN.base.stroke, SCEN.base.dm], backgroundColor: 'rgba(74,255,170,0.6)', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'bottom', labels: { padding: 12 } } },
        scales: { x: { beginAtZero: true, max: 75, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false } } },
      },
    });
  };

  const renderCompliance = () => {
    const cnv = document.getElementById('complianceChart');
    if (!cnv || !window.Chart) return;
    if (charts.compliance) charts.compliance.destroy();
    charts.compliance = new Chart(cnv, {
      type: 'doughnut',
      data: {
        labels: ['При соблюдении', 'Снижение'],
        datasets: [{ data: [59, 41], backgroundColor: [C.mint, 'rgba(74,255,170,0.15)'], borderColor: 'rgba(9,12,24,0.8)', borderWidth: 3 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.label + ': ' + ctx.parsed + '%' } } },
      },
    });
  };

  // data (optional): [{ band, chronoAge, bioAge }] from /v1/analytics/bio-age.
  // Without it, falls back to the synthetic demo series.
  const renderPopBioAge = (data) => {
    const cnv = document.getElementById('popBioAgeChart');
    if (!cnv || !window.Chart) return;
    const real = Array.isArray(data) && data.length;
    const labels = real ? data.map((d) => d.band) : ['30–39','40–49','50–59','60–69','70+'];
    const chrono = real ? data.map((d) => d.chronoAge) : [34.5, 44.1, 54.2, 64.0, 73.5];
    const bio = real ? data.map((d) => d.bioAge) : [37.2, 48.3, 58.1, 69.2, 78.1];
    if (charts.popBio) charts.popBio.destroy();
    charts.popBio = new Chart(cnv, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Хронологический', data: chrono, backgroundColor: 'rgba(0,229,255,0.25)', borderRadius: 6 },
          { label:'Биологический',   data: bio, backgroundColor: 'rgba(167,139,250,0.55)', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
      },
    });
  };

  const renderEconomics = () => {
    const cnv = document.getElementById('economicsChart');
    if (!cnv || !window.Chart) return;
    if (charts.econ) charts.econ.destroy();
    const labels = ['Q1','Q2','Q3','Q4','Q1','Q2','Q3','Q4'];
    charts.econ = new Chart(cnv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Предотвращённые госпитализации', data:[12, 18, 23, 29, 34, 41, 48, 56], borderColor: C.mint, backgroundColor: (ctx) => A.areaGradient(ctx, C.mint, 0.3), fill: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + ' × млн ₽' } }, x: { grid: { display: false } } },
      },
    });
  };

  // data (optional): { columns, rows:[{ band, values }] } from /v1/analytics/heatmap.
  // Without it, falls back to the synthetic risk matrix below.
  const renderHeatmap = (data) => {
    const el = document.getElementById('heatmapContainer');
    if (!el) return;
    const real = data && Array.isArray(data.rows) && data.rows.length;
    const rows = real ? data.rows.map((r) => r.band) : ['20–29','30–39','40–49','50–59','60–69','70+'];
    const cols = real ? data.columns : ['ССЗ','СД2','Онко','ХБП','Когн.'];
    /* risk matrix (0–100): live per-band averages, or synthetic demo */
    const m = real
      ? data.rows.map((r) => r.values)
      : [
          [ 4,  3,  2,  2,  1],
          [ 9,  8,  6,  5,  3],
          [18, 16, 12, 10,  7],
          [32, 26, 20, 18, 14],
          [48, 34, 28, 26, 24],
          [62, 41, 36, 35, 38],
        ];
    const cell = (v) => {
      const col = window.Ariadna.riskColor(v);
      const alpha = 0.2 + (v / 100) * 0.75;
      return `<td style="padding:12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:${col};background:${col}${Math.floor(alpha*255).toString(16).padStart(2,'0')};border-radius:6px;min-width:52px">${v}</td>`;
    };
    el.innerHTML = `
      <table style="border-collapse:separate;border-spacing:4px;width:100%">
        <thead><tr><th></th>${cols.map((c) => `<th style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);font-weight:500;padding:6px">${c}</th>`).join('')}</tr></thead>
        <tbody>${m.map((r, i) => `<tr><td style="text-align:right;font-size:12px;color:var(--text-3);padding:6px 8px;white-space:nowrap">${rows[i]}</td>${r.map(cell).join('')}</tr>`).join('')}</tbody>
      </table>`;
  };

  /* ---------- KPI sparklines ---------- */
  const initSparks = () => {
    document.querySelectorAll('.stat-card').forEach((card, i) => {
      let spk = card.querySelector('.kpi-spark');
      if (!spk) {
        spk = document.createElement('div');
        spk.className = 'kpi-spark';
        card.appendChild(spk);
      }
      const datasets = [
        [1200, 1210, 1215, 1225, 1230, 1238, 1241, 1247],
        [18, 19, 17, 20, 21, 22, 23, 23],
        [0.821, 0.824, 0.828, 0.831, 0.834, 0.838, 0.842, 0.847],
        [280, 310, 295, 325, 340, 335, 345, 348],
      ];
      const colors = [C.cyan, C.rose, C.mint, C.amber];
      if (window.Ariadna?.sparkline) window.Ariadna.sparkline(spk, datasets[i % datasets.length], colors[i % colors.length]);
    });
  };

  /* ---------- Chart filter chips ---------- */
  window.setChartFilter = (el, kind) => {
    el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    el.classList.add('active');
    renderTrend(kind);
  };

  /* ============================================================
     Session & live data (Phase 3)
     ============================================================
     Прогрессивное улучшение, а не жёсткий гард: дашборд остаётся
     работоспособным демо офлайн, но подтягивает живые данные из API,
     если есть валидная сессия (refresh-cookie от login.html).
  */
  const applyAuthUi = (mode) => {
    const chip = document.getElementById('authChip');
    const btn = document.getElementById('authBtn');
    if (chip) {
      const map = {
        authenticated: ['● Живые данные', 'var(--mint)'],
        demo: ['● Демо-режим', 'var(--amber)'],
        offline: ['● Сервер недоступен', 'var(--text-3)'],
      };
      const [text, color] = map[mode] || map.demo;
      chip.textContent = text;
      Object.assign(chip.style, {
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        letterSpacing: '0.04em',
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        whiteSpace: 'nowrap',
      });
      chip.hidden = false;
    }
    if (btn) {
      if (mode === 'authenticated') {
        btn.textContent = 'Выйти';
        btn.onclick = () => window.logout();
      } else {
        btn.textContent = 'Войти';
        btn.onclick = () => { location.href = 'login.html?redirect=dashboard.html'; };
      }
      btn.hidden = false;
    }
  };

  // 'authenticated' — есть валидная сессия; 'demo' — сервер ответил, но сессии нет;
  // 'offline' — сервер недоступен (сеть). Демо-режим и в demo, и в offline.
  const ensureSession = async () => {
    const api = window.HCApi;
    if (!api) return 'demo';
    try {
      const data = await api.request('/v1/auth/refresh', {
        method: 'POST',
        body: {},
        auth: false,
        _retried: true,
      });
      if (data && data.accessToken) {
        api.setAccessToken(data.accessToken);
        return 'authenticated';
      }
      return 'demo';
    } catch (err) {
      return err && err.code === 'NETWORK' ? 'offline' : 'demo';
    }
  };

  const loadRealPatients = async () => {
    const api = window.HCApi;
    const res = await api.patients.list({ pageSize: 100 });
    const items = (res && res.items) || [];
    PATIENTS = items.map(api.adapters.patientToRow);
    renderOverviewTable();
    renderPatientTable();
    return PATIENTS.length;
  };

  // Популяционная аналитика → KPI-карточки + распределение по уровням риска.
  const loadAnalytics = async () => {
    const api = window.HCApi;
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const fmtN = (n) => (n ?? 0).toLocaleString('ru-RU');

    try {
      const s = await api.analytics.summary();
      setText('kpiTotal', fmtN(s.totalPatients));
      setText('kpiCritical', fmtN(s.byLevel?.CRITICAL ?? 0));
      setText('kpiAuc', (s.modelAuc ?? 0).toFixed(3));
    } catch { /* нет данных — оставляем демо-числа */ }

    try {
      const dist = await api.analytics.riskDistribution(); // [{ level, count }]
      const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      dist.forEach((d) => { if (d.level in byLevel) byLevel[d.level] = d.count; });
      riskDistData = [byLevel.LOW, byLevel.MEDIUM, byLevel.HIGH, byLevel.CRITICAL];
      const total = riskDistData.reduce((a, b) => a + b, 0) || 1;
      const cell = (n) => `${n.toLocaleString('ru-RU')} (${Math.round((n / total) * 100)}%)`;
      setText('rdLow', cell(byLevel.LOW));
      setText('rdMed', cell(byLevel.MEDIUM));
      setText('rdHigh', cell(byLevel.HIGH));
      setText('rdCrit', cell(byLevel.CRITICAL));
      if (charts.riskDist) {
        charts.riskDist.data.datasets[0].data = riskDistData.slice();
        charts.riskDist.update('none');
      } else {
        renderRiskDist();
      }
    } catch { /* нет данных — оставляем демо-распределение */ }

    try {
      const bio = await api.analytics.bioAge(); // [{ band, chronoAge, bioAge }]
      if (Array.isArray(bio) && bio.length) renderPopBioAge(bio);
    } catch { /* нет данных — оставляем демо-график био-возраста */ }

    try {
      const heat = await api.analytics.heatmap(); // { columns, rows:[{ band, values }] }
      if (heat && Array.isArray(heat.rows) && heat.rows.length) renderHeatmap(heat);
    } catch { /* нет данных — оставляем демо-тепловую карту */ }
  };

  window.logout = async () => {
    try {
      await window.HCApi?.auth.logout();
    } finally {
      location.href = 'login.html?redirect=dashboard.html';
    }
  };

  const initSession = async () => {
    const mode = await ensureSession();
    if (mode === 'authenticated') {
      try {
        const n = await loadRealPatients();
        await loadAnalytics();
        applyAuthUi('authenticated');
        window.showToastDB?.('Данные загружены', `Пациенты из API · ${n} карт`, 'success');
      } catch (err) {
        applyAuthUi('demo');
        window.showToastDB?.('Демо-режим', 'API недоступен — показаны демо-данные', 'info');
      }
    } else {
      applyAuthUi(mode);
    }
  };

  /* ---------- Init ---------- */
  const init = () => {
    renderOverviewTable();
    renderPatientTable();
    renderRecs();
    renderRiskSummary();

    /* Charts */
    renderTrend();
    renderRiskDist();
    renderRadar();
    renderTimeline();
    renderShap();
    renderScenarioChart();
    renderCompliance();
    renderPopBioAge();
    renderEconomics();
    renderHeatmap();

    initSparks();

    /* Animate bio-age ring */
    const ring = document.getElementById('bioAgeCircle');
    if (ring) {
      const circumference = 314;
      const ratio = Math.min(1, 64 / 80);
      ring.style.strokeDashoffset = circumference - circumference * ratio;
    }

    /* Проверка сессии + подтягивание живых данных (или демо-режим) */
    initSession();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* Re-render charts on theme/resize tick */
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { Object.values(charts).forEach((c) => c?.resize?.()); }, 120);
  });
})();
