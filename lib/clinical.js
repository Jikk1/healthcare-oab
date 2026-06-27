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

/** Поля labs (id) → ключи серверного BiomarkerBody. */
export const BIOMARKER_MAP = {
  systolicBp: 'systolicBp',
  diastolicBp: 'diastolicBp',
  ldl: 'ldl',
  hdl: 'hdl',
  totalChol: 'totalChol',
  hba1c: 'hba1c',
  bmi: 'bmi',
  egfr: 'egfr',
  packYears: 'packYears',
  activityPerWeek: 'activityPerWeek',
};

/** Поля, которые сервер ждёт целыми (z.number().int()). */
export const BIOMARKER_INT = new Set(['systolicBp', 'diastolicBp', 'activityPerWeek']);

const isNum = (v) => v !== undefined && v !== null && !Number.isNaN(v);

/**
 * Маппит набор значений анализов { fieldId: number } в серверный BiomarkerBody.
 * Пустые поля пропускаются. Целочисленные показатели округляются. Курение и
 * число родственников с ССЗ — отдельными аргументами (familyCv>0 ⇒ true).
 * Возвращает { body, count }, где count — число перенесённых биомаркеров.
 */
export function mapBiomarkers(values = {}, { smokingStatus = 'NEVER', familyCv } = {}) {
  const body = { smokingStatus };
  let count = 0;
  for (const [fid, key] of Object.entries(BIOMARKER_MAP)) {
    const v = values[fid];
    if (isNum(v)) {
      body[key] = BIOMARKER_INT.has(fid) ? Math.round(v) : v;
      count++;
    }
  }
  if (isNum(familyCv)) body.familyHistoryCvd = familyCv > 0;
  return { body, count };
}
