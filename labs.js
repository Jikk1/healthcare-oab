/* ============================================================
   HealthCareOAB+ — Страница ввода анализов (labs.html)
   ============================================================
   Собирает мультимодальный HealthProfile из лабораторных показателей
   (ОАК, биохимия, липиды, витальные…) и прогоняет его через тот же движок
   OmniRisk, что и predict.html. Расчёт в браузере (по умолчанию) или на
   сервере (HCApi). Пустые поля не учитываются — это влияет на полноту данных
   и ширину доверительных интервалов, а не ломает расчёт.
   ============================================================ */
import './lib/telemetry.js';
import { resolveRange, fieldStatus, mapBiomarkers } from './lib/clinical.js';
import { escapeHtml } from './lib/format.js';
import { observeDynamicStyles } from './lib/dom.js';
import { initI18n } from './lib/i18n.js';
import { stashProfile } from './lib/handoff.js';
import {
  COLORS, riskColor, probAt, syncSeg,
  renderKpis as kpiMarkup, renderCatFilter as catFilter,
  renderDiseases as diseaseList, renderTwinRadar as twinRadar,
} from './lib/omni-render.js';

(() => {
  'use strict';
  const { runOmniRisk, CATEGORY_LABELS } = window.OmniRisk;
  const api = window.HCApi;
  const $ = (id) => document.getElementById(id);

  /* ---------- Конфигурация полей ----------
     path — куда положить значение в HealthProfile (точечный путь).
     ref  — [lo, hi] норма, либо {MALE,FEMALE,OTHER:[lo,hi]} для пол-зависимых.
     higherBetter — выше нормы хорошо (HDL, СКФ, активность, SpO₂).            */
  const GROUPS = [
    { id: 'cbc', title: 'Общий анализ крови (ОАК)', open: true, fields: [
      { id: 'hemoglobin', path: 'labs.hemoglobin', label: 'Гемоглобин', unit: 'г/л', step: 1, ref: { MALE: [130, 170], FEMALE: [120, 150], OTHER: [120, 170] }, higherBetter: true },
      { id: 'hematocrit', path: 'labs.hematocrit', label: 'Гематокрит', unit: '%', step: 0.1, ref: { MALE: [40, 50], FEMALE: [36, 46], OTHER: [36, 50] }, higherBetter: true },
      { id: 'wbc', path: 'labs.wbc', label: 'Лейкоциты', unit: '10⁹/л', step: 0.1, ref: [4, 9] },
      { id: 'platelets', path: 'labs.platelets', label: 'Тромбоциты', unit: '10⁹/л', step: 1, ref: [150, 400] },
      { id: 'neutrophils', path: 'labs.neutrophils', label: 'Нейтрофилы', unit: '10⁹/л', step: 0.1, ref: [2, 7] },
      { id: 'lymphocytes', path: 'labs.lymphocytes', label: 'Лимфоциты', unit: '10⁹/л', step: 0.1, ref: [1, 3] },
      { id: 'esr', path: 'labs.esr', label: 'СОЭ', unit: 'мм/ч', step: 1, ref: [0, 15] },
    ] },
    { id: 'lipids', title: 'Липиды и биохимия', fields: [
      { id: 'totalChol', path: 'labs.totalChol', label: 'Холестерин общий', unit: 'мМ', step: 0.1, ref: [0, 5.0] },
      { id: 'ldl', path: 'labs.ldl', label: 'ЛПНП (LDL)', unit: 'мМ', step: 0.1, ref: [0, 3.0] },
      { id: 'hdl', path: 'labs.hdl', label: 'ЛПВП (HDL)', unit: 'мМ', step: 0.1, ref: { MALE: [1.0, 2.5], FEMALE: [1.2, 2.5], OTHER: [1.0, 2.5] }, higherBetter: true },
      { id: 'triglycerides', path: 'metabolomic.triglycerides', label: 'Триглицериды', unit: 'мМ', step: 0.1, ref: [0, 1.7] },
      { id: 'alt', path: 'labs.alt', label: 'АЛТ', unit: 'Ед/л', step: 1, ref: [0, 40] },
      { id: 'uricAcid', path: 'metabolomic.uricAcid', label: 'Мочевая кислота', unit: 'мкМ', step: 1, ref: [200, 420] },
    ] },
    { id: 'glyc', title: 'Гликемия', fields: [
      { id: 'hba1c', path: 'labs.hba1c', label: 'HbA1c (гликир.)', unit: '%', step: 0.1, ref: [0, 5.7] },
      { id: 'glucoseFasting', path: 'metabolomic.glucoseFasting', label: 'Глюкоза натощак', unit: 'мМ', step: 0.1, ref: [3.9, 5.5] },
    ] },
    { id: 'cardio', title: 'Почки, воспаление и кардиомаркеры', fields: [
      { id: 'egfr', path: 'labs.egfr', label: 'СКФ (eGFR)', unit: 'мл/мин', step: 1, ref: [90, 200], higherBetter: true },
      { id: 'crp', path: 'proteomic.crp', label: 'вч-СРБ', unit: 'мг/л', step: 0.1, ref: [0, 1.0] },
      { id: 'troponin', path: 'proteomic.troponin', label: 'вч-Тропонин', unit: 'нг/л', step: 0.1, ref: [0, 14] },
      { id: 'ntProBnp', path: 'proteomic.ntProBnp', label: 'NT-proBNP', unit: 'пг/мл', step: 1, ref: [0, 125] },
    ] },
    { id: 'vitals', title: 'Витальные и антропометрия', fields: [
      { id: 'systolicBp', path: 'labs.systolicBp', label: 'САД (верхнее)', unit: 'мм', step: 1, ref: [90, 120] },
      { id: 'diastolicBp', path: 'labs.diastolicBp', label: 'ДАД (нижнее)', unit: 'мм', step: 1, ref: [60, 80] },
      { id: 'bmi', path: 'labs.bmi', label: 'ИМТ', unit: 'кг/м²', step: 0.1, ref: [18.5, 25] },
      { id: 'restingHr', path: 'wearables.restingHr', label: 'Пульс покоя', unit: 'уд', step: 1, ref: [55, 80] },
      { id: 'spo2', path: 'wearables.spo2', label: 'SpO₂', unit: '%', step: 1, ref: [96, 100], higherBetter: true },
    ] },
    { id: 'life', title: 'Образ жизни', fields: [
      { id: 'packYears', path: 'lifestyle.packYears', label: 'Пачко-лет курения', unit: '', step: 1, ref: [0, 0] },
      { id: 'alcoholUnitsPerWeek', path: 'lifestyle.alcoholUnitsPerWeek', label: 'Алкоголь', unit: 'ед/нед', step: 1, ref: [0, 7] },
      { id: 'activityPerWeek', path: 'lifestyle.activityPerWeek', label: 'Активность', unit: '×/нед', step: 1, ref: [3, 14], higherBetter: true },
      { id: 'sleepHours', path: 'lifestyle.sleepHours', label: 'Сон', unit: 'ч', step: 0.5, ref: [7, 9] },
    ] },
    { id: 'genom', title: 'Геном и семья', fields: [
      { id: 'prsCv', path: 'genomic.prs.CARDIOVASCULAR', label: 'PRS · ССЗ', unit: 'z', step: 0.1, ref: [-3, 1] },
      { id: 'prsOnco', path: 'genomic.prs.ONCOLOGY', label: 'PRS · Онко', unit: 'z', step: 0.1, ref: [-3, 1] },
      { id: 'familyCv', path: 'family.affected.CARDIOVASCULAR', label: 'Родственники с ССЗ', unit: 'чел', step: 1, ref: [0, 0] },
    ] },
  ];
  const FIELDS = GROUPS.flatMap((g) => g.fields);
  const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

  const state = { sex: 'MALE', smoke: 'NEVER', source: 'client', horizon: '10', category: 'all' };
  const charts = {};
  let last = null;

  /* ---------- Утилиты путей ---------- */
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] || (o[keys[i]] = {});
    o[keys[keys.length - 1]] = value;
  }

  /* ---------- Нормы с учётом пола (чистая логика — в lib/clinical.js) ---------- */
  const refRange = (field) => resolveRange(field.ref, state.sex);
  // status: 'ok' | 'warn' | 'bad' | null (нет значения)
  const statusOf = (field, value) => fieldStatus(refRange(field), value);
  function refText(field) {
    const [lo, hi] = refRange(field);
    if (lo === 0 && hi === 0) return 'норма 0';
    if (field.higherBetter) return '≥ ' + lo;
    if (lo === 0) return '< ' + hi;
    return lo + '–' + hi;
  }

  /* ---------- Построение полей ввода ---------- */
  function buildGroups() {
    $('groups').innerHTML = GROUPS.map((g) => `
      <details class="or-accordion"${g.open ? ' open' : ''}>
        <summary>${g.title}<span class="grp-count" id="cnt-${g.id}"></span></summary>
        <div data-sty="padding:8px 0">
          ${g.fields.map((f) => `
            <div class="lab-field">
              <div class="lab-meta">
                <div class="lab-name">${f.label}</div>
                <div class="lab-ref">${f.unit ? f.unit + ' · ' : ''}норма ${refText(f)}</div>
              </div>
              <div class="lab-input" id="wrap-${f.id}">
                <input type="number" id="${f.id}" step="${f.step}" inputmode="decimal" placeholder="—" aria-label="${f.label}" />
                ${f.unit ? `<span class="lab-unit">${f.unit}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </details>`).join('');
  }

  /* ---------- Чтение значений ---------- */
  function fieldValue(f) {
    const raw = $(f.id).value.trim();
    if (raw === '') return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? v : undefined;
  }

  function readProfile() {
    const profile = { ageYears: Number($('age').value) || 45, sex: state.sex };
    for (const f of FIELDS) {
      const v = fieldValue(f);
      if (v !== undefined) setPath(profile, f.path, v);
    }
    // Курение задаём всегда — это значимый фактор и якорь модальности «образ жизни».
    profile.lifestyle = profile.lifestyle || {};
    profile.lifestyle.smokingStatus = state.smoke;
    return profile;
  }

  /* ---------- Подсветка полей + полнота ---------- */
  function refreshFieldStates() {
    const counts = {};
    for (const g of GROUPS) counts[g.id] = 0;
    for (const f of FIELDS) {
      const v = fieldValue(f);
      const wrap = $('wrap-' + f.id);
      wrap.classList.remove('s-ok', 's-warn', 's-bad');
      const st = statusOf(f, v);
      if (st) wrap.classList.add('s-' + st);
      if (v !== undefined) {
        const g = GROUPS.find((gr) => gr.fields.includes(f));
        counts[g.id]++;
      }
    }
    for (const g of GROUPS) {
      const filled = counts[g.id];
      $('cnt-' + g.id).textContent = filled ? filled + '/' + g.fields.length : '';
    }
  }

  function renderCompleteness(r) {
    const pct = Math.round((r ? r.completeness : 0) * 100);
    $('compPct').textContent = pct + '%';
    $('compBar').style.width = pct + '%';
  }

  /* ---------- Флаги отклонений ---------- */
  function renderFlags() {
    const out = [];
    for (const f of FIELDS) {
      const v = fieldValue(f);
      const st = statusOf(f, v);
      if (st && st !== 'ok') {
        const [lo, hi] = refRange(f);
        const dir = v < lo ? '↓' : '↑';
        const col = st === 'bad' ? COLORS.rose : COLORS.amber;
        out.push(`<span class="flag" data-sty="color:${col};border-color:${col}55;background:${col}11">${dir} ${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}</span>`);
      }
    }
    const filled = FIELDS.filter((f) => fieldValue(f) !== undefined).length;
    if (filled === 0) { $('flags').innerHTML = ''; return; }
    $('flags').innerHTML = out.length
      ? out.join('')
      : `<span class="flag flag-ok">✓ Все введённые показатели (${filled}) в пределах нормы</span>`;
  }

  /* ---------- KPI ---------- */
  function renderKpis(r) {
    const le = r.lifeExpectancy;
    const kpis = [
      { v: r.healthIndex, l: 'Индекс здоровья', hint: `уверенность ${Math.round(r.confidence * 100)}%`, color: riskColor(100 - r.healthIndex) },
      { v: le.biologicalAge, l: 'Биологический возраст', hint: `паспортный ${r.ageYears}`, color: le.biologicalAge > r.ageYears ? COLORS.rose : COLORS.mint },
      { v: le.lifeExpectancy, l: 'Ожид. продолж. жизни', hint: `здоровой ${le.healthspan}`, color: COLORS.cyan },
      { v: '+' + le.yearsOfLifeLostModifiable, l: 'Возвратимые годы', hint: 'при коррекции факторов', color: COLORS.mint },
      { v: r.predictions.length, l: 'Болезней оценено', hint: `${r.modalitiesPresent.length} модальностей данных`, color: COLORS.violet },
    ];
    kpiMarkup($('kpis'), kpis);
  }

  /* ---------- Фильтр категорий ---------- */
  function renderCatFilter(r) {
    catFilter($('catFilter'), r, CATEGORY_LABELS, state.category, (cat) => { state.category = cat; renderDiseases(last); });
  }

  /* ---------- Список болезней (некликабельный, метка ДИ, компактный бейдж) ---------- */
  function renderDiseases(r) {
    diseaseList($('diseaseList'), r, {
      horizon: state.horizon, category: state.category, categoryLabels: CATEGORY_LABELS,
      horizonLabelEl: $('horizonLabel'), ciLabel: 'ДИ',
      badgeExtra: ';font-size:10px;padding:1px 7px;border-radius:999px',
    });
  }

  /* ---------- Драйверы ведущего риска ---------- */
  function renderDrivers(r) {
    const top = r.predictions.slice().sort((a, b) => probAt(b, '10') - probAt(a, '10'))[0];
    if (!top) { $('drivers').innerHTML = ''; return; }
    $('driverDisease').textContent = '· ' + top.name;
    const causal = r.causal[top.id];
    if (!causal || !causal.drivers.length) {
      $('drivers').innerHTML = '<div class="cap" data-sty="margin:0">Недостаточно данных для разбора факторов. Заполните больше показателей.</div>';
      return;
    }
    const rows = causal.drivers.slice(0, 6).map((d) => `
      <div class="driver-row">
        <div>
          <div class="d-nm">${d.label}</div>
          <div class="d-sub">${d.causal ? 'модифицируемый' : 'немодифицируемый'} · вклад ${Math.round(d.contribution * 100)}%</div>
        </div>
        <div class="d-val" data-sty="color:${d.causal ? COLORS.mint : COLORS.violet}">${d.causal ? '−' + d.counterfactualReductionPct + '%' : '—'}</div>
      </div>`).join('');
    $('drivers').innerHTML = rows +
      `<div class="or-note">Модифицируемая доля риска: <b data-sty="color:${COLORS.mint}">${causal.modifiableSharePct}%</b>. Колонка справа — оценка снижения риска при нормализации фактора.</div>`;
  }

  /* ---------- Радар цифрового двойника ---------- */
  function renderTwinRadar(r) { twinRadar(charts, $('twinRadar'), r); }

  /* ---------- Источник вычислений ---------- */
  function setComputeHint(html, asHtml = false) {
    const el = $('computeHint');
    if (asHtml) el.innerHTML = html; else el.textContent = html;
  }

  /* ---------- Применить результат ---------- */
  function applyResult(r) {
    last = r;
    renderCompleteness(r);
    renderKpis(r);
    renderCatFilter(r);
    renderDiseases(r);
    renderDrivers(r);
    renderTwinRadar(r);
  }

  let seq = 0;
  async function compute() {
    refreshFieldStates();
    renderFlags();
    const profile = readProfile();
    const mySeq = ++seq;

    if (state.source === 'server' && api) {
      setComputeHint('· вычисляю на сервере…');
      try {
        const r = await api.predict.run(profile);
        if (mySeq !== seq) return;
        applyResult(r);
        setComputeHint('· сервер');
        return;
      } catch (err) {
        if (mySeq !== seq) return;
        setComputeHint((err && err.code) === 'NETWORK' ? '· сервер недоступен → локальный расчёт' : '· ошибка API → локальный расчёт');
      }
    }
    applyResult(runOmniRisk(profile));
    if (state.source === 'client') setComputeHint('');
  }

  // Дебаунс для «строчащего» ввода.
  let debounce = null;
  function scheduleCompute() {
    refreshFieldStates();
    clearTimeout(debounce);
    debounce = setTimeout(compute, 300);
  }

  /* ---------- Импорт / экспорт ---------- */
  function exportJson() {
    const data = { age: Number($('age').value) || null, sex: state.sex, smoke: state.smoke, values: {} };
    for (const f of FIELDS) { const v = fieldValue(f); if (v !== undefined) data.values[f.id] = v; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'healthcare-oab-labs.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        clearAll(true);
        if (data.age) $('age').value = data.age;
        if (data.sex) { state.sex = data.sex; syncSeg('sex', 'sex', data.sex); }
        if (data.smoke) { state.smoke = data.smoke; syncSeg('smoke', 'smoke', data.smoke); }
        for (const [id, v] of Object.entries(data.values || {})) { if (FIELD_BY_ID.has(id) && $(id)) $(id).value = v; }
        compute();
      } catch {
        setComputeHint('· не удалось прочитать файл');
      }
    };
    reader.readAsText(file);
  }
  function clearAll(silent) {
    for (const f of FIELDS) $(f.id).value = '';
    if (!silent) { refreshFieldStates(); compute(); }
  }

  /* ---------- Врачебный режим: сохранение ассессмента в карту ----------
     Поля labs (клинические единицы) маппятся в BiomarkerBody сервера. Поля,
     которых нет в форме (onStatins) опускаем — у сервера есть значения по умолчанию. */
  // Считываем значения нужных полей из DOM и отдаём чистому мапперу из lib.
  function buildBiomarkerBody() {
    // Собираем ВСЕ введённые показатели формы: типизированные колонки маппер
    // разложит по ключам BiomarkerBody, остальное сохранит в labPanel —
    // ни один введённый анализ не теряется.
    const values = {};
    for (const f of FIELDS) {
      const v = fieldValue(f);
      if (v !== undefined) values[f.id] = v;
    }
    const familyCv = values.familyCv;
    return mapBiomarkers(values, { smokingStatus: state.smoke, familyCv });
  }

  // Проверяет сессию и, если врач авторизован, открывает блок и грузит пациентов.
  async function enableDoctorMode() {
    if (!api) return;
    const ok = await api.auth.refresh().catch(() => false);
    const box = $('doctorBox');
    const loginHint = $('doctorLoginHint');
    const banner = $('demoBanner');
    if (!ok) {
      if (box) box.hidden = true;
      if (loginHint) loginHint.hidden = false;
      if (banner) banner.hidden = false; // нет сессии → демо-режим, данные не сохраняются
      return;
    }
    if (loginHint) loginHint.hidden = true;
    if (banner) banner.hidden = true; // врач вошёл → сохранение в карту доступно
    try {
      const res = await api.patients.list({ pageSize: 100 });
      const items = (res && res.items) || [];
      const sel = $('patientSelect');
      sel.innerHTML = items.length
        ? items.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.fullName)} · ${escapeHtml(p.mrn)}</option>`).join('')
        : '<option value="">— нет доступных карт —</option>';
      $('doctorHint').textContent = '● ' + items.length + ' карт';
      if (box) box.hidden = false;
    } catch {
      if (box) box.hidden = true;
    }
  }

  async function saveToPatient() {
    const id = $('patientSelect').value;
    const out = $('assessResult');
    if (!id) { out.innerHTML = '<span data-sty="color:var(--amber)">Выберите пациента</span>'; return; }
    const { body, count } = buildBiomarkerBody();
    if (count === 0) { out.innerHTML = '<span data-sty="color:var(--amber)">Введите хотя бы один показатель (АД, ЛПНП, HbA1c, ИМТ…)</span>'; return; }
    const btn = $('assessBtn');
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Сохранение…';
    try {
      const r = await api.patients.assess(id, body);
      const a = (r && r.assessment) || {};
      const recs = (r && r.recommendations) || [];
      const lvlRu = { LOW: 'низкий', MEDIUM: 'умеренный', HIGH: 'высокий', CRITICAL: 'критический' };
      out.innerHTML =
        `<span data-sty="color:var(--mint)">✓ Сохранено.</span> Риск: <b>${lvlRu[a.riskLevel] || a.riskLevel || '—'}</b>` +
        (a.cvRisk != null ? ` · ССЗ ${Number(a.cvRisk).toFixed(1)}%` : '') +
        (a.bioAge != null ? ` · биовозраст ${Math.round(a.bioAge)}` : '') +
        (recs.length ? ` · рекомендаций: ${recs.length}` : '');
    } catch (e) {
      out.innerHTML = `<span data-sty="color:var(--rose)">Ошибка: ${e && e.message ? e.message : 'не удалось сохранить'}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

  /* ---------- Инициализация ---------- */
  function init() {
    observeDynamicStyles(); // применяет data-sty к innerHTML-рендерам (CSP: без style-src 'unsafe-inline')
    initI18n(); // переключатель RU/EN (переведены шапка и навигация; поля/результаты — RU)
    buildGroups();

    document.querySelectorAll('#groups input, #age').forEach((el) => el.addEventListener('input', scheduleCompute));
    $('age').addEventListener('input', scheduleCompute);

    document.querySelectorAll('#sex button').forEach((b) => b.addEventListener('click', () => { state.sex = b.dataset.sex; syncSeg('sex', 'sex', b.dataset.sex); compute(); }));
    document.querySelectorAll('#smoke button').forEach((b) => b.addEventListener('click', () => { state.smoke = b.dataset.smoke; syncSeg('smoke', 'smoke', b.dataset.smoke); compute(); }));

    document.querySelectorAll('#computeSource button').forEach((b) => b.addEventListener('click', async () => {
      const src = b.dataset.src;
      if (src === 'server') {
        if (!api) { setComputeHint('· API недоступен'); return; }
        setComputeHint('· проверяю сессию…');
        const ok = await api.auth.refresh().catch(() => false);
        if (!ok) { setComputeHint('· <a href="login.html?redirect=labs.html" data-sty="color:var(--cyan)">войти</a> для серверного режима', true); return; }
        enableDoctorMode(); // авторизовались → открыть сохранение в карту
      }
      state.source = src;
      syncSeg('computeSource', 'src', src);
      compute();
    }));

    document.querySelectorAll('#horizons button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#horizons button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); state.horizon = b.dataset.h; renderDiseases(last);
    }));

    $('calcBtn').addEventListener('click', compute);
    $('clearBtn').addEventListener('click', () => clearAll(false));
    $('saveBtn').addEventListener('click', exportJson);
    $('loadBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('assessBtn').addEventListener('click', saveToPatient);

    // «Детальный разбор →»: передаём собранный профиль (включая ОАК/кардиомаркеры)
    // в predict.html через sessionStorage вместо простого перехода по ссылке.
    const detailCta = $('detailCta');
    if (detailCta) detailCta.addEventListener('click', (e) => {
      e.preventDefault();
      stashProfile(readProfile(), detailCta.getAttribute('href') || 'predict.html');
    });

    // Демо-старт: показываем, что страница «живая», даже без ввода.
    compute();
    // Тихо проверяем сессию: если врач уже вошёл — открыть сохранение в карту.
    enableDoctorMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
