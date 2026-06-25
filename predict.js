/* ============================================================
   OmniRisk — UI страницы прогнозирования (predict.html)
   ============================================================ */
(() => {
  'use strict';
  const { runOmniRisk, simulateIntervention, CATEGORY_LABELS } = window.OmniRisk;
  const $ = (id) => document.getElementById(id);
  const api = window.HCApi; // для серверного режима вычислений (Фаза 4)

  const COLORS = {
    low: '#4AFFAA', medium: '#FFB547', high: '#FF8A5B', critical: '#FF5E7E',
    cyan: '#00E5FF', mint: '#4AFFAA', violet: '#A78BFA', rose: '#FF5E7E', amber: '#FFB547',
  };
  const levelColor = (lvl) => COLORS[lvl.toLowerCase()] || COLORS.cyan;
  const levelLabel = { LOW: 'Низкий', MEDIUM: 'Умеренный', HIGH: 'Высокий', CRITICAL: 'Критический' };
  const riskColor = (p) => (p < 8 ? COLORS.mint : p < 20 ? COLORS.amber : p < 40 ? COLORS.high : COLORS.rose);

  /* ---------- Пресеты профиля ---------- */
  const PRESETS = {
    healthy: { age: 35, sex: 'FEMALE', sbp: 112, ldl: 24, hdl: 17, hba1c: 50, bmi: 22, egfr: 100, smoke: 'NEVER', pack: 0, act: 5, diet: 85, sleep: 75, stress: 2, alc: 2, prsCv: -5, prsOnco: -3, mono: 0, epi: -3, crp: 5, pm: 6, fam: 0 },
    typical: { age: 50, sex: 'MALE', sbp: 132, ldl: 33, hdl: 12, hba1c: 57, bmi: 27, egfr: 88, smoke: 'FORMER', pack: 8, act: 2, diet: 58, sleep: 70, stress: 4, alc: 6, prsCv: 3, prsOnco: 2, mono: 0, epi: 1, crp: 18, pm: 10, fam: 1 },
    high: { age: 64, sex: 'MALE', sbp: 168, ldl: 52, hdl: 9, hba1c: 66, bmi: 32, egfr: 60, smoke: 'CURRENT', pack: 32, act: 0, diet: 32, sleep: 52, stress: 8, alc: 16, prsCv: 21, prsOnco: 14, mono: 1, epi: 8, crp: 60, pm: 22, fam: 2 },
  };

  const state = { sex: 'MALE', smoke: 'NEVER', horizon: '10', category: 'all', shapDisease: 'ihd', interventions: new Set(), source: 'client' };
  const charts = {};

  /* ---------- Считать профиль из контролов ---------- */
  function readProfile() {
    const num = (id) => parseInt($(id).value, 10);
    const profile = {
      ageYears: num('age'),
      sex: state.sex,
      genomic: { prs: { CARDIOVASCULAR: num('prsCv') / 10, ONCOLOGY: num('prsOnco') / 10 }, monogenic: Array.from({ length: num('mono') }, (_, i) => 'VAR' + i) },
      epigenetic: { methylationAgeAccel: num('epi') },
      proteomic: { crp: num('crp') / 10 },
      labs: { systolicBp: num('sbp'), ldl: num('ldl') / 10, hdl: num('hdl') / 10, hba1c: num('hba1c') / 10, bmi: num('bmi'), egfr: num('egfr') },
      lifestyle: { smokingStatus: state.smoke, packYears: num('pack'), activityPerWeek: num('act'), dietQuality: num('diet'), sleepHours: num('sleep') / 10, stressLevel: num('stress'), alcoholUnitsPerWeek: num('alc') },
      environmental: { airPm25: num('pm') },
      family: { affected: { CARDIOVASCULAR: num('fam') } },
    };
    return profile;
  }

  /* ---------- Применить пресет ---------- */
  function applyPreset(name) {
    const p = PRESETS[name];
    for (const [k, v] of Object.entries(p)) {
      if (k === 'sex') { state.sex = v; syncSeg('sex', 'sex', v); }
      else if (k === 'smoke') { state.smoke = v; syncSeg('smoke', 'smoke', v); }
      else if ($(k)) $(k).value = v;
    }
    syncLabels();
    render();
  }

  function syncSeg(containerId, dataKey, value) {
    document.querySelectorAll(`#${containerId} button`).forEach((b) => b.classList.toggle('active', b.dataset[dataKey] === value));
  }

  /* ---------- Обновить подписи значений ---------- */
  const LABELS = {
    age: ['ageV', (v) => v], sbp: ['sbpV', (v) => v], ldl: ['ldlV', (v) => (v / 10).toFixed(1)], hdl: ['hdlV', (v) => (v / 10).toFixed(1)],
    hba1c: ['hba1cV', (v) => (v / 10).toFixed(1)], bmi: ['bmiV', (v) => v], egfr: ['egfrV', (v) => v],
    pack: ['packV', (v) => v], act: ['actV', (v) => v], diet: ['dietV', (v) => v], sleep: ['sleepV', (v) => (v / 10).toFixed(1)],
    stress: ['stressV', (v) => v], alc: ['alcV', (v) => v], prsCv: ['prsCvV', (v) => (v / 10).toFixed(1)], prsOnco: ['prsOncoV', (v) => (v / 10).toFixed(1)],
    mono: ['monoV', (v) => v], epi: ['epiV', (v) => v], crp: ['crpV', (v) => (v / 10).toFixed(1)], pm: ['pmV', (v) => v], fam: ['famV', (v) => v],
  };
  function syncLabels() {
    for (const [id, [labelId, fmt]] of Object.entries(LABELS)) {
      const el = $(id), lab = $(labelId);
      if (el && lab) lab.textContent = fmt(parseInt(el.value, 10));
    }
  }

  /* ---------- KPI ---------- */
  function renderKpis(r) {
    const le = r.lifeExpectancy;
    const kpis = [
      { v: r.healthIndex, l: 'Индекс здоровья', hint: `уверенность ${Math.round(r.confidence * 100)}%`, color: riskColor(100 - r.healthIndex) },
      { v: le.biologicalAge, l: 'Биологический возраст', hint: `паспортный ${r.ageYears}`, color: le.biologicalAge > r.ageYears ? COLORS.rose : COLORS.mint },
      { v: le.lifeExpectancy, l: 'Ожид. продолж. жизни', hint: `здоровой ${le.healthspan}`, color: COLORS.cyan },
      { v: '+' + le.yearsOfLifeLostModifiable, l: 'Возвратимые годы', hint: 'при коррекции факторов', color: COLORS.mint },
      { v: le.disabilityRisk10y + '%', l: 'Риск инвалидизации 10л', hint: '', color: riskColor(le.disabilityRisk10y) },
      { v: r.predictions.length, l: 'Болезней оценено', hint: `${r.modalitiesPresent.length} модальностей`, color: COLORS.violet },
    ];
    $('kpis').innerHTML = kpis.map((k) => `
      <div class="or-kpi">
        <div class="v" style="color:${k.color}">${k.v}</div>
        <div class="l">${k.l}</div>
        ${k.hint ? `<div class="hint">${k.hint}</div>` : ''}
      </div>`).join('');
  }

  /* ---------- Фильтр категорий ---------- */
  function renderCatFilter(r) {
    const cats = [...new Set(r.predictions.map((p) => p.category))];
    const chips = ['<button data-cat="all" class="' + (state.category === 'all' ? 'active' : '') + '">Все</button>']
      .concat(cats.map((c) => `<button data-cat="${c}" class="${state.category === c ? 'active' : ''}">${CATEGORY_LABELS[c]}</button>`));
    $('catFilter').innerHTML = chips.join('');
    document.querySelectorAll('#catFilter button').forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.cat; render(); }));
  }

  /* ---------- Список болезней ---------- */
  function probAt(p, h) { const x = p.horizons.find((hh) => String(hh.years) === String(h)); return x ? x.probability : 0; }
  function ciAt(p, h) { const x = p.horizons.find((hh) => String(hh.years) === String(h)); return x ? x.ci : [0, 0]; }

  function renderDiseases(r) {
    const hLabels = { '1': '1 год', '3': '3 года', '5': '5 лет', '10': '10 лет', '20': '20 лет', lifetime: 'пожизненно' };
    $('horizonLabel').textContent = '· ' + hLabels[state.horizon];
    let list = r.predictions.slice();
    if (state.category !== 'all') list = list.filter((p) => p.category === state.category);
    list.sort((a, b) => probAt(b, state.horizon) - probAt(a, state.horizon));
    $('diseaseList').innerHTML = list.map((p) => {
      const prob = probAt(p, state.horizon), ci = ciAt(p, state.horizon), col = levelColor(p.riskLevel);
      const onset = p.onsetAgeEstimate ? `дебют ~${p.onsetAgeEstimate} лет · ` : '';
      return `<div class="or-disease" data-disease="${p.id}" style="cursor:pointer">
        <div>
          <div class="nm">${p.name} <span class="risk-badge" style="background:${col}22;color:${col};border:1px solid ${col}55">${levelLabel[p.riskLevel]}</span></div>
          <div class="meta">${p.icd11} · ${CATEGORY_LABELS[p.category]} · ${onset}RR ${p.relativeRisk}× · CI ${ci[0]}–${ci[1]}%</div>
        </div>
        <div class="or-prob" style="color:${riskColor(prob)}">${prob}%</div>
        <div class="or-bar"><i style="width:${Math.min(100, prob)}%;background:${riskColor(prob)}"></i></div>
      </div>`;
    }).join('');
    document.querySelectorAll('#diseaseList .or-disease').forEach((row) => row.addEventListener('click', () => {
      state.shapDisease = row.dataset.disease; renderExplain(window._last);
    }));
  }

  /* ---------- Цифровой двойник: радар ---------- */
  function renderTwinRadar(r) {
    const cur = r.digitalTwin.current;
    const data = {
      labels: cur.map((s) => s.label),
      datasets: [{ label: 'Индекс здоровья', data: cur.map((s) => s.health), borderColor: COLORS.cyan, backgroundColor: 'rgba(0,229,255,0.18)', pointBackgroundColor: COLORS.cyan, pointBorderColor: '#04121A', pointBorderWidth: 2 }],
    };
    if (charts.radar) { charts.radar.data = data; charts.radar.update('none'); return; }
    charts.radar = new Chart($('twinRadar'), {
      type: 'radar', data,
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.08)' }, angleLines: { color: 'rgba(255,255,255,0.08)' }, pointLabels: { color: '#A6AFC4', font: { size: 11 } } } } },
    });
  }

  /* ---------- Цифровой двойник: траектория ---------- */
  function renderTwinLine(r) {
    const base = r.digitalTwin.baselineTrajectory, opt = r.digitalTwin.optimizedTrajectory;
    const data = {
      labels: base.map((p) => '+' + p.yearOffset + 'л'),
      datasets: [
        { label: 'Без вмешательства', data: base.map((p) => p.overall), borderColor: COLORS.rose, backgroundColor: 'rgba(255,94,126,0.12)', fill: true, tension: 0.35 },
        { label: 'При соблюдении', data: opt.map((p) => p.overall), borderColor: COLORS.mint, backgroundColor: 'rgba(74,255,170,0.12)', fill: true, tension: 0.35 },
      ],
    };
    if (charts.line) { charts.line.data = data; charts.line.update('none'); return; }
    charts.line = new Chart($('twinLine'), {
      type: 'line', data,
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#A6AFC4', padding: 14, usePointStyle: true } } },
        scales: { y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#A6AFC4' } }, x: { grid: { display: false }, ticks: { color: '#A6AFC4' } } } },
    });
  }

  /* ---------- Объяснимость: SHAP + attention ---------- */
  function renderExplain(r) {
    const dis = r.predictions.find((p) => p.id === state.shapDisease) || r.predictions[0];
    state.shapDisease = dis.id;
    $('shapDisease').textContent = '· ' + dis.name;
    const exp = r.explanations[dis.id];
    if (!exp) { $('shapList').innerHTML = '<div class="cap">Нет данных объяснимости для этой болезни (вне топ-12). Кликните на болезнь из топа.</div>'; $('attList').innerHTML = ''; $('causalChain').textContent = ''; return; }

    const top = exp.shap.slice(0, 8);
    const max = Math.max(...top.map((s) => Math.abs(s.value)), 0.01);
    $('shapList').innerHTML = top.map((s) => {
      const pos = s.value >= 0, w = Math.abs(s.value) / max * 50, col = pos ? COLORS.rose : COLORS.mint;
      return `<div class="or-shaprow">
        <div title="${s.feature}">${s.feature}${s.modifiable ? '' : ' <span style="color:var(--text-3);font-size:10px">(немод.)</span>'}</div>
        <div class="track"><div class="fill" style="${pos ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${col}"></div></div>
        <div class="val" style="color:${col}">${pos ? '+' : ''}${s.value.toFixed(2)}</div>
      </div>`;
    }).join('');

    $('attList').innerHTML = exp.attention.slice(0, 8).map((a) => `
      <div class="or-att-row">
        <div>${a.modality}</div>
        <div class="track"><i style="width:${Math.round(a.weight * 100)}%"></i></div>
        <div style="font-family:var(--font-mono);text-align:right">${Math.round(a.weight * 100)}%</div>
      </div>`).join('');

    const causal = r.causal[dis.id];
    if (causal) {
      const topDrivers = causal.drivers.filter((d) => d.causal).slice(0, 3).map((d) => d.label).join(' → ');
      $('causalChain').innerHTML = `<b>Причинная цепочка:</b> ${topDrivers || 'основные факторы'} → ${dis.name}. ` +
        `Модифицируемая доля риска: <b style="color:${COLORS.mint}">${causal.modifiableSharePct}%</b>.`;
    }
  }

  /* ---------- Сценарное моделирование ---------- */
  function buildOverrides() {
    const ov = { labs: {}, lifestyle: {} };
    const iv = state.interventions;
    if (iv.has('bp')) ov.labs.systolicBp = 125;
    if (iv.has('ldl')) ov.labs.ldl = 2.4;
    if (iv.has('weight')) ov.labs.bmi = 24;
    if (iv.has('quit')) ov.lifestyle.smokingStatus = 'FORMER';
    if (iv.has('active')) ov.lifestyle.activityPerWeek = 5;
    return ov;
  }
  function renderIntervention() {
    if (state.interventions.size === 0) {
      $('interventionResult').innerHTML = '<div class="cap">Выберите одно или несколько вмешательств выше, чтобы увидеть прогнозируемый эффект.</div>';
      return;
    }
    const delta = simulateIntervention(readProfile(), buildOverrides());
    const top = delta.perDisease.slice(0, 6);
    const sign = (v) => (v >= 0 ? '+' : '') + v;
    $('interventionResult').innerHTML = `
      <div class="or-kpis" style="margin-bottom:16px">
        <div class="or-kpi"><div class="v" style="color:${delta.healthIndexDelta >= 0 ? COLORS.mint : COLORS.rose}">${sign(delta.healthIndexDelta)}</div><div class="l">Индекс здоровья</div></div>
        <div class="or-kpi"><div class="v" style="color:${COLORS.cyan}">${sign(delta.lifeExpectancyDelta)} л</div><div class="l">Ожид. продолж. жизни</div></div>
      </div>
      ${top.map((d) => `<div class="or-disease">
        <div><div class="nm">${d.name}</div><div class="meta">10-летний риск</div></div>
        <div class="or-prob"><span style="color:${COLORS.rose}">${d.before}%</span> <span style="color:var(--text-3)">→</span> <span style="color:${COLORS.mint}">${d.after}%</span></div>
        <div class="or-bar"><i style="width:${Math.min(100, d.reductionPct)}%;background:${COLORS.mint}"></i></div>
      </div>`).join('') || '<div class="cap">Заметного эффекта на основные риски нет.</div>'}`;
  }

  /* ---------- Подпись источника вычислений ---------- */
  function setComputeHint(html, asHtml = false) {
    const el = $('computeHint');
    if (!el) return;
    if (asHtml) el.innerHTML = html;
    else el.textContent = html;
  }

  /* ---------- Полный рендер ---------- */
  // Применяет готовый результат ко всем панелям. Един для браузера и сервера —
  // формы ответа идентичны (один и тот же движок OmniRisk).
  function applyResult(r) {
    window._last = r;
    renderKpis(r);
    renderCatFilter(r);
    renderDiseases(r);
    renderTwinRadar(r);
    renderTwinLine(r);
    renderExplain(r);
    renderIntervention();
  }

  // Защита от гонок: учитываем только ответ на самый свежий запрос.
  let renderSeq = 0;
  let serverDebounce = null;

  async function renderNow() {
    const profile = readProfile();
    const seq = ++renderSeq;

    if (state.source === 'server' && api) {
      setComputeHint('· вычисляю на сервере…');
      try {
        const r = await api.predict.run(profile);
        if (seq !== renderSeq) return; // пришёл более новый запрос — игнорируем
        applyResult(r);
        setComputeHint('· сервер');
        return;
      } catch (err) {
        if (seq !== renderSeq) return;
        // Откат на локальный движок, чтобы UI не «залипал».
        const code = err && err.code;
        setComputeHint(code === 'NETWORK' ? '· сервер недоступен → локальный расчёт' : '· ошибка API → локальный расчёт');
      }
    }

    // Браузерный режим (или откат): синхронный локальный расчёт.
    applyResult(runOmniRisk(profile));
    if (state.source === 'client') setComputeHint('');
  }

  // В серверном режиме слайдеры «строчат» событиями — дебаунсим сетевые вызовы.
  function render() {
    if (state.source === 'server') {
      clearTimeout(serverDebounce);
      serverDebounce = setTimeout(renderNow, 350);
    } else {
      renderNow();
    }
  }

  /* ---------- События ---------- */
  function init() {
    syncLabels();
    // Слайдеры
    document.querySelectorAll('#inputPanel input[type=range]').forEach((el) => {
      el.addEventListener('input', () => { syncLabels(); render(); });
    });
    // Пол / курение
    document.querySelectorAll('#sex button').forEach((b) => b.addEventListener('click', () => { state.sex = b.dataset.sex; syncSeg('sex', 'sex', b.dataset.sex); render(); }));
    document.querySelectorAll('#smoke button').forEach((b) => b.addEventListener('click', () => { state.smoke = b.dataset.smoke; syncSeg('smoke', 'smoke', b.dataset.smoke); render(); }));
    // Источник вычислений: браузер ↔ сервер API. Серверный режим требует сессии.
    document.querySelectorAll('#computeSource button').forEach((b) => b.addEventListener('click', async () => {
      const src = b.dataset.src;
      if (src === 'server') {
        if (!api) { setComputeHint('· API недоступен'); return; }
        setComputeHint('· проверяю сессию…');
        const ok = await api.auth.refresh().catch(() => false);
        if (!ok) { setComputeHint('· <a href="login.html?redirect=predict.html" style="color:var(--cyan)">войти</a> для серверного режима', true); return; }
      }
      state.source = src;
      syncSeg('computeSource', 'src', src);
      render();
    }));
    // Пресеты
    document.querySelectorAll('#presets button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#presets button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); applyPreset(b.dataset.preset);
    }));
    // Горизонты
    document.querySelectorAll('#horizons button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#horizons button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); state.horizon = b.dataset.h; renderDiseases(window._last);
    }));
    // Вмешательства
    document.querySelectorAll('#interventions button').forEach((b) => b.addEventListener('click', () => {
      const iv = b.dataset.iv;
      if (state.interventions.has(iv)) state.interventions.delete(iv); else state.interventions.add(iv);
      b.classList.toggle('active'); renderIntervention();
    }));
    applyPreset('typical');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
