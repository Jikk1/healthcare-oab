/* ============================================================
   HealthCareOAB+ — Чистая клиническая логика (без DOM)
   ============================================================
   Переиспользуется страницей анализов (labs.js) и покрыта unit-тестами
   (test/frontend/clinical.test.js). Никаких обращений к window/document —
   только данные на входе и выходе.
   ============================================================ */

/**
 * Разрешает референсный диапазон поля с учётом пола.
 * ref — либо [lo, hi], либо { MALE:[..], FEMALE:[..], OTHER:[..] }.
 */
export function resolveRange(ref, sex) {
  if (Array.isArray(ref)) return ref;
  return ref[sex] || ref.OTHER;
}

/**
 * Оценка значения относительно нормы:
 *   'ok'   — в пределах [lo, hi];
 *   'warn' — отклонение ≤ 40% ширины нормы;
 *   'bad'  — отклонение > 40%;
 *   null   — значение не задано.
 * Для «точечных» норм вида [0,0] ширина берётся по масштабу границы.
 */
export function fieldStatus(range, value) {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const [lo, hi] = range;
  const span = (hi - lo) || Math.abs(hi) || Math.abs(lo) || 1;
  if (value >= lo && value <= hi) return 'ok';
  const dev = value < lo ? lo - value : value - hi;
  return dev > span * 0.4 ? 'bad' : 'warn';
}

/** Поля labs (id) → ключи серверного BiomarkerBody (типизированные колонки). */
export const BIOMARKER_MAP = {
  systolicBp: 'systolicBp',
  diastolicBp: 'diastolicBp',
  ldl: 'ldl',
  hdl: 'hdl',
  totalChol: 'totalChol',
  hba1c: 'hba1c',
  bmi: 'bmi',
  egfr: 'egfr',
  // Общий анализ крови (ОАК) — у сервера есть типизированные колонки.
  hemoglobin: 'hemoglobin',
  hematocrit: 'hematocrit',
  wbc: 'wbc',
  platelets: 'platelets',
  neutrophils: 'neutrophils',
  lymphocytes: 'lymphocytes',
  esr: 'esr',
  packYears: 'packYears',
  activityPerWeek: 'activityPerWeek',
};

/** Поля, которые сервер ждёт целыми (z.number().int()). */
export const BIOMARKER_INT = new Set(['systolicBp', 'diastolicBp', 'activityPerWeek']);

const isNum = (v) => v !== undefined && v !== null && !Number.isNaN(v);

// id полей формы, которые НЕ являются лабораторными показателями и не должны
// попадать в labPanel как «сырой анализ» (семейный анамнез — отдельный флаг).
const NON_PANEL_FIELDS = new Set(['familyCv']);

/**
 * Маппит набор значений анализов { fieldId: number } в серверный BiomarkerBody.
 * Пустые поля пропускаются. Целочисленные показатели округляются. Курение и
 * число родственников с ССЗ — отдельными аргументами (familyCv>0 ⇒ true).
 *
 * Показатели с типизированной колонкой (BIOMARKER_MAP) кладутся в тело как есть.
 * Всё остальное, что ввёл врач (триглицериды, АЛТ, СРБ, тропонин, PRS…), не
 * теряется — оно сохраняется в `labPanel` (id поля → значение). Так ни один
 * введённый анализ не выпадает, даже без отдельной колонки в БД.
 *
 * Возвращает { body, count }, где count — общее число введённых показателей
 * (в колонках + в labPanel).
 */
export function mapBiomarkers(values = {}, { smokingStatus = 'NEVER', familyCv } = {}) {
  const body = { smokingStatus };
  const labPanel = {};
  let count = 0;
  // Типизированные колонки.
  for (const [fid, key] of Object.entries(BIOMARKER_MAP)) {
    const v = values[fid];
    if (isNum(v)) {
      body[key] = BIOMARKER_INT.has(fid) ? Math.round(v) : v;
      count++;
    }
  }
  // Показатели без своей колонки — в сырой набор, чтобы ничего не потерять.
  for (const [fid, v] of Object.entries(values)) {
    if (fid in BIOMARKER_MAP || NON_PANEL_FIELDS.has(fid) || !isNum(v)) continue;
    labPanel[fid] = v;
    count++;
  }
  if (Object.keys(labPanel).length) body.labPanel = labPanel;
  if (isNum(familyCv)) body.familyHistoryCvd = familyCv > 0;
  return { body, count };
}
