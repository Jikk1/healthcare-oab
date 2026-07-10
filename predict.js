/* ============================================================
   OmniRisk — UI страницы прогнозирования (predict.html)
   ============================================================ */
import './lib/telemetry.js';
import { observeDynamicStyles } from './lib/dom.js';
import { initI18n } from './lib/i18n.js';
import { takeProfile } from './lib/handoff.js';
import { escapeHtml } from './lib/format.js';
import {
  COLORS, riskColor, syncSeg,
  renderKpis as kpiMarkup, renderCatFilter as catFilter,
  renderDiseases as diseaseList, renderTwinRadar as twinRadar,
} from './lib/omni-render.js';

(() => {
  'use strict';
  const { runOmniRisk, simulateIntervention, CATEGORY_LABELS } = window.OmniRisk;
  const $ = (id) => document.getElementById(id);
  const api = window.HCApi; // для серверного режима вычислений (Фаза 4)

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

  /* ---------- Приём профиля из labs.html (handoff) ----------
     Слайдеры покрывают лишь часть богатого профиля из анализов. Поэтому:
     1) стартуем от пресета «типичный», чтобы слайдеры без соответствия имели
        разумные значения; 2) переопределяем слайдеры теми полями, что маппятся
        (обратное масштабирование к readProfile); 3) первый рендер делаем от
        ПОЛНОГО профиля — так ОАК/кардиомаркеры/etc. участвуют в разборе, даже
        если у них нет ползунка. Любое движение слайдера дальше пересчитывает
        от песочницы (обычное поведение). */
  function pick(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function seedFromProfile(p) {
    // База: значения пресета «типичный» (без рендера).
    for (const [k, v] of Object.entries(PRESETS.typical)) {
      if (k === 'sex') { state.sex = v; syncSeg('sex', 'sex', v); }
      else if (k === 'smoke') { state.smoke = v; syncSeg('smoke', 'smoke', v); }
      else if ($(k)) $(k).value = v;
    }
    // Переопределяем тем, что реально пришло. factor — обратное к readProfile.
    const set = (id, val, factor = 1) => {
      if (val == null || !Number.isFinite(val) || !$(id)) return;
      $(id).value = Math.round(val * factor); // range-инпут сам зажмёт в min/max
    };
    set('age', pick(p, 'ageYears'));
    set('sbp', pick(p, 'labs.systolicBp'));
    set('ldl', pick(p, 'labs.ldl'), 10);
    set('hdl', pick(p, 'labs.hdl'), 10);
    set('hba1c', pick(p, 'labs.hba1c'), 10);
    set('bmi', pick(p, 'labs.bmi'));
    set('egfr', pick(p, 'labs.egfr'));
    set('pack', pick(p, 'lifestyle.packYears'));
    set('act', pick(p, 'lifestyle.activityPerWeek'));
    set('sleep', pick(p, 'lifestyle.sleepHours'), 10);
    set('alc', pick(p, 'lifestyle.alcoholUnitsPerWeek'));
    set('crp', pick(p, 'proteomic.crp'), 10);
    set('prsCv', pick(p, 'genomic.prs.CARDIOVASCULAR'), 10);
    set('prsOnco', pick(p, 'genomic.prs.ONCOLOGY'), 10);
    set('fam', pick(p, 'family.affected.CARDIOVASCULAR'));
    if (p.sex) { state.sex = p.sex; syncSeg('sex', 'sex', p.sex); }
    const smoke = pick(p, 'lifestyle.smokingStatus');
    if (smoke) { state.smoke = smoke; syncSeg('smoke', 'smoke', smoke); }
    syncLabels();
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
    kpiMarkup($('kpis'), kpis);
  }

  /* ---------- Фильтр категорий ---------- */
  function renderCatFilter(r) {
    catFilter($('catFilter'), r, CATEGORY_LABELS, state.category, (cat) => { state.category = cat; render(); });
  }

  /* ---------- Список болезней (кликабельный: строка → SHAP-разбор) ---------- */
  function renderDiseases(r) {
    diseaseList($('diseaseList'), r, {
      horizon: state.horizon, category: state.category, categoryLabels: CATEGORY_LABELS,
      horizonLabelEl: $('horizonLabel'), clickable: true, ciLabel: 'CI',
      onSelect: (id) => { state.shapDisease = id; renderExplain(window._last); },
    });
  }

  /* ---------- Цифровой двойник: радар ---------- */
  function renderTwinRadar(r) { twinRadar(charts, $('twinRadar'), r); }

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
        <div title="${s.feature}">${s.feature}${s.modifiable ? '' : ' <span data-sty="color:var(--text-3);font-size:10px">(немод.)</span>'}</div>
        <div class="track"><div class="fill" data-sty="${pos ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${col}"></div></div>
        <div class="val" data-sty="color:${col}">${pos ? '+' : ''}${s.value.toFixed(2)}</div>
      </div>`;
    }).join('');

    $('attList').innerHTML = exp.attention.slice(0, 8).map((a) => `
      <div class="or-att-row">
        <div>${a.modality}</div>
        <div class="track"><i data-sty="width:${Math.round(a.weight * 100)}%"></i></div>
        <div data-sty="font-family:var(--font-mono);text-align:right">${Math.round(a.weight * 100)}%</div>
      </div>`).join('');

    const causal = r.causal[dis.id];
    if (causal) {
      const topDrivers = causal.drivers.filter((d) => d.causal).slice(0, 3).map((d) => d.label).join(' → ');
      $('causalChain').innerHTML = `<b>Причинная цепочка:</b> ${topDrivers || 'основные факторы'} → ${dis.name}. ` +
        `Модифицируемая доля риска: <b data-sty="color:${COLORS.mint}">${causal.modifiableSharePct}%</b>.`;
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
      <div class="or-kpis" data-sty="margin-bottom:16px">
        <div class="or-kpi"><div class="v" data-sty="color:${delta.healthIndexDelta >= 0 ? COLORS.mint : COLORS.rose}">${sign(delta.healthIndexDelta)}</div><div class="l">Индекс здоровья</div></div>
        <div class="or-kpi"><div class="v" data-sty="color:${COLORS.cyan}">${sign(delta.lifeExpectancyDelta)} л</div><div class="l">Ожид. продолж. жизни</div></div>
      </div>
      ${top.map((d) => `<div class="or-disease">
        <div><div class="nm">${d.name}</div><div class="meta">10-летний риск</div></div>
        <div class="or-prob"><span data-sty="color:${COLORS.rose}">${d.before}%</span> <span data-sty="color:var(--text-3)">→</span> <span data-sty="color:${COLORS.mint}">${d.after}%</span></div>
        <div class="or-bar"><i data-sty="width:${Math.min(100, d.reductionPct)}%;background:${COLORS.mint}"></i></div>
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
    // Любой пересчёт делает показанный результат «несохранённым» — врач видит,
    // что текущие цифры ещё не записаны в карту пациента (БД).
    markUnsaved();
  }

  /* ---------- Врачебный режим: сохранение прогноза в карту (БД) ----------
     predict строит богатый HealthProfile; в карту сохраняем клинические
     показатели, которые у сервера имеют смысл (BiomarkerBody). Всё введённое,
     что не попало в типизированные поля, уходит в labPanel — ничего не теряем. */
  let savedForProfile = false;
  function setSaveState(html) {
    const el = $('assessResult');
    if (el) el.innerHTML = html;
  }
  // Помечает результат несохранённым (только когда врач в режиме сохранения).
  function markUnsaved() {
    const box = $('doctorBox');
    if (!box || box.hidden) return;
    savedForProfile = false;
    setSaveState('<span data-sty="color:var(--amber)">● не сохранено — нажмите «Сохранить прогноз в карту»</span>');
  }

  function profileToBiomarkerBody(p) {
    const labs = p.labs || {};
    const life = p.lifestyle || {};
    const body = { smokingStatus: life.smokingStatus || 'NEVER' };
    let count = 0;
    const put = (k, v, int) => {
      if (Number.isFinite(v)) { body[k] = int ? Math.round(v) : v; count++; }
    };
    put('systolicBp', labs.systolicBp, true);
    put('ldl', labs.ldl);
    put('hdl', labs.hdl);
    put('hba1c', labs.hba1c);
    put('bmi', labs.bmi);
    put('egfr', labs.egfr);
    put('packYears', life.packYears);
    put('activityPerWeek', life.activityPerWeek, true);
    const fam = p.family && p.family.affected && p.family.affected.CARDIOVASCULAR;
    if (Number.isFinite(fam)) body.familyHistoryCvd = fam > 0;
    // Показатели без типизированной колонки сохраняем в сыром наборе.
    const panel = {};
    const crp = p.proteomic && p.proteomic.crp;
    if (Number.isFinite(crp)) panel.crp = crp;
    if (Object.keys(panel).length) { body.labPanel = panel; count += Object.keys(panel).length; }
    return { body, count };
  }

  // Проверяет сессию; если врач авторизован — открывает блок и грузит пациентов.
  // Возвращает true, если сессия активна (используется для авто-серверного режима).
  async function enableDoctorMode() {
    if (!api) return false;
    const ok = await api.auth.refresh().catch(() => false);
    const box = $('doctorBox');
    const loginHint = $('doctorLoginHint');
    const banner = $('demoBanner');
    if (!ok) {
      if (box) box.hidden = true;
      if (loginHint) loginHint.hidden = false;
      if (banner) banner.hidden = false; // нет сессии → демо-режим, данные не сохраняются
      return false;
    }
    if (loginHint) loginHint.hidden = true;
    if (banner) banner.hidden = true; // врач вошёл → сохранение в карту доступно
    try {
      const res = await api.patients.list({ pageSize: 100 });
      const items = (res && res.items) || [];
      const sel = $('patientSelect');
      if (sel) sel.innerHTML = items.length
        ? items.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.fullName)} · ${escapeHtml(p.mrn)}</option>`).join('')
        : '<option value="">— нет доступных карт —</option>';
      const hint = $('doctorHint');
      if (hint) hint.textContent = '● ' + items.length + ' карт';
      if (box) box.hidden = false;
      markUnsaved();
    } catch {
      if (box) box.hidden = true;
    }
    return true;
  }

  async function saveToPatient() {
    const id = $('patientSelect').value;
    if (!id) { setSaveState('<span data-sty="color:var(--amber)">Выберите пациента</span>'); return; }
    const { body, count } = profileToBiomarkerBody(readProfile());
    if (count === 0) { setSaveState('<span data-sty="color:var(--amber)">Нет показателей для сохранения</span>'); return; }
    const btn = $('assessBtn');
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Сохранение…';
    try {
      const r = await api.patients.assess(id, body);
      const a = (r && r.assessment) || {};
      const recs = (r && r.recommendations) || [];
      const lvlRu = { LOW: 'низкий', MEDIUM: 'умеренный', HIGH: 'высокий', CRITICAL: 'критический' };
      savedForProfile = true;
      setSaveState(
        `<span data-sty="color:var(--mint)">✓ Сохранено в карту.</span> Риск: <b>${lvlRu[a.riskLevel] || a.riskLevel || '—'}</b>` +
        (a.cvRisk != null ? ` · ССЗ ${Number(a.cvRisk).toFixed(1)}%` : '') +
        (a.bioAge != null ? ` · биовозраст ${Math.round(a.bioAge)}` : '') +
        (recs.length ? ` · рекомендаций: ${recs.length}` : ''),
      );
    } catch (e) {
      setSaveState(`<span data-sty="color:var(--rose)">Ошибка: ${e && e.message ? e.message : 'не удалось сохранить'}</span>`);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
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
    observeDynamicStyles(); // применяет data-sty к innerHTML-рендерам (CSP: без style-src 'unsafe-inline')
    initI18n(); // переключатель RU/EN (переведены шапка и навигация; поля/результаты — RU)
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
        if (!ok) { setComputeHint('· <a href="login.html?redirect=predict.html" data-sty="color:var(--cyan)">войти</a> для серверного режима', true); return; }
        enableDoctorMode(); // авторизованы → открыть сохранение в карту
      }
      state.source = src;
      syncSeg('computeSource', 'src', src);
      render();
    }));
    // Сохранение прогноза в карту пациента.
    const assessBtn = $('assessBtn');
    if (assessBtn) assessBtn.addEventListener('click', saveToPatient);
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

    // Если пришли из labs.html — считаем от переданного профиля целиком
    // (богатые поля не теряются), а слайдеры засеваем маппируемым подмножеством.
    const handoff = takeProfile();
    if (handoff) {
      document.querySelectorAll('#presets button').forEach((x) => x.classList.remove('active'));
      seedFromProfile(handoff);
      applyResult(runOmniRisk(handoff));
      setComputeHint('· профиль из анализов');
    } else {
      applyPreset('typical');
    }

    // Тихо проверяем сессию: если врач уже вошёл — включаем серверный режим
    // (расчёт на сервере) и открываем сохранение прогноза в карту. Один запрос:
    // enableDoctorMode сам делает refresh и возвращает статус сессии.
    if (api) {
      enableDoctorMode().then((ok) => {
        if (!ok) return;
        state.source = 'server';
        syncSeg('computeSource', 'src', 'server');
        render();
      }).catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
