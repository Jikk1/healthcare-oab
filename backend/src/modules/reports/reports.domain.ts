import type { RiskLevel } from '@prisma/client';

/**
 * Reporting domain — чистые функции формирования данных кольцевых диаграмм
 * (без БД, поэтому легко тестируются). Один и тот же контракт `DonutReport`
 * отдаётся фронту как JSON и используется для PNG-рендера и Excel-экспорта.
 */

export interface DonutSegment {
  /** Подпись категории (для легенды/таблицы). */
  label: string;
  /** Числовое значение (пациенты — штуки; профиль пациента — риск в %). */
  value: number;
  /** Доля сегмента в кольце, % (сумма ≈ 100). */
  share: number;
  /** HEX-цвет без '#'-префикса? Нет — с '#', как в CSS/Chart.js. */
  color: string;
}

/** Точка временного ряда (динамика показателей). */
export interface TrendPoint {
  /** Метка периода: 'YYYY-MM' (агрегат) или ISO-дата (пациент). */
  date: string;
  value: number;
}

/** Временной ряд для линейного графика «динамика показателей». */
export interface TrendSeries {
  title: string;
  unit: string;
  color: string;
  points: TrendPoint[];
}

/** Разрешённый период отчёта. */
export interface ResolvedPeriod {
  from: Date;
  to: Date;
  label: string;
  /** Ключ пресета для UI/экспорта. */
  key: string;
}

export interface DonutReport {
  /** Заголовок отчёта. */
  title: string;
  /** Подзаголовок (напр. общий риск / кол-во). */
  subtitle: string;
  /** Значение в центре кольца (сумма/итог). */
  centerValue: string;
  /** Единица (для таблицы/подписей): 'пациентов' | '%'. */
  unit: string;
  segments: DonutSegment[];
  /** Период отчёта (фильтр). */
  period?: { key: string; label: string };
  /** Динамика показателей во времени (опционально). */
  trend?: TrendSeries;
  /** Момент формирования (ISO) — для экспорта/комплаенса. */
  generatedAt?: string;
}

/**
 * Разрешает период отчёта в диапазон дат. Пресеты: month | quarter | year | all,
 * либо явные from/to (ISO). Относительно текущего момента.
 */
export function resolvePeriod(input: {
  period?: string;
  from?: string;
  to?: string;
}): ResolvedPeriod {
  const to = input.to ? new Date(input.to) : new Date();
  if (input.from) {
    const from = new Date(input.from);
    return { from, to, key: 'custom', label: `${fmtDate(from)} — ${fmtDate(to)}` };
  }
  const key = input.period ?? 'all';
  const from = new Date(to);
  switch (key) {
    case 'month':
      from.setMonth(from.getMonth() - 1);
      return { from, to, key, label: 'За месяц' };
    case 'quarter':
      from.setMonth(from.getMonth() - 3);
      return { from, to, key, label: 'За квартал' };
    case 'year':
      from.setFullYear(from.getFullYear() - 1);
      return { from, to, key, label: 'За год' };
    default:
      return { from: new Date(0), to, key: 'all', label: 'За всё время' };
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Пациент: динамика интегрального риска по истории ассессментов. */
export function toPatientTrend(
  assessments: Array<{ computedAt: Date; overallRisk: number }>,
): TrendSeries {
  const points = [...assessments]
    .sort((a, b) => a.computedAt.getTime() - b.computedAt.getTime())
    .map((a) => ({ date: fmtDate(a.computedAt), value: round1(a.overallRisk) }));
  return { title: 'Динамика интегрального риска', unit: '%', color: '#FF5E7E', points };
}

/** Кабинет: помесячная динамика среднего риска по ассессментам. */
export function toDoctorTrend(
  assessments: Array<{ computedAt: Date; overallRisk: number }>,
): TrendSeries {
  const byMonth = new Map<string, { sum: number; n: number }>();
  for (const a of assessments) {
    const key = a.computedAt.toISOString().slice(0, 7); // YYYY-MM
    const cur = byMonth.get(key) ?? { sum: 0, n: 0 };
    cur.sum += a.overallRisk;
    cur.n += 1;
    byMonth.set(key, cur);
  }
  const points = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, value: round1(v.sum / v.n) }));
  return { title: 'Средний риск по месяцам', unit: '%', color: '#00E5FF', points };
}

const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
  LOW: { label: 'Низкий', color: '#4AFFAA' },
  MEDIUM: { label: 'Умеренный', color: '#FFB547' },
  HIGH: { label: 'Высокий', color: '#FF8A5B' },
  CRITICAL: { label: 'Критический', color: '#FF5E7E' },
};
const LEVEL_ORDER: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const round1 = (v: number): number => Math.round(v * 10) / 10;

function withShares(raw: Array<{ label: string; value: number; color: string }>): DonutSegment[] {
  const sum = raw.reduce((a, s) => a + s.value, 0);
  return raw.map((s) => ({ ...s, share: sum > 0 ? round1((s.value / sum) * 100) : 0 }));
}

/**
 * Агрегат по кабинету врача: распределение пациентов по уровню риска.
 * @param byLevel количество пациентов на каждый RiskLevel
 */
export function toDoctorDonut(byLevel: Record<RiskLevel, number>): DonutReport {
  const raw = LEVEL_ORDER.map((lvl) => ({
    label: LEVEL_META[lvl].label,
    value: byLevel[lvl] ?? 0,
    color: LEVEL_META[lvl].color,
  }));
  const total = raw.reduce((a, s) => a + s.value, 0);
  return {
    title: 'Пациенты по уровню риска',
    subtitle: `Всего под наблюдением: ${total}`,
    centerValue: String(total),
    unit: 'пациентов',
    segments: withShares(raw),
  };
}

/** Поля ассессмента, нужные для профильной диаграммы пациента. */
export interface PatientRiskInput {
  fullName?: string;
  overallRisk: number;
  miRisk: number;
  strokeRisk: number;
  dmRisk: number;
  oncoRisk: number;
  ckdRisk: number;
  neuroRisk: number;
}

const DOMAINS: Array<{ label: string; key: keyof PatientRiskInput; color: string }> = [
  { label: 'Инфаркт (ИМ)', key: 'miRisk', color: '#FF5E7E' },
  { label: 'Инсульт', key: 'strokeRisk', color: '#FFB547' },
  { label: 'СД2', key: 'dmRisk', color: '#A78BFA' },
  { label: 'Онко', key: 'oncoRisk', color: '#FF8A5B' },
  { label: 'ХБП', key: 'ckdRisk', color: '#00E5FF' },
  { label: 'Когнитивные', key: 'neuroRisk', color: '#4AFFAA' },
];

/**
 * Индивидуальный профиль пациента: вклад доменов в общий риск (композиция).
 * value — абсолютный 10-летний риск домена (%), share — его доля в сумме.
 */
export function toPatientDonut(a: PatientRiskInput): DonutReport {
  const raw = DOMAINS.map((d) => ({
    label: d.label,
    value: round1(Number(a[d.key] ?? 0)),
    color: d.color,
  }));
  return {
    title: a.fullName ? `Профиль риска · ${a.fullName}` : 'Профиль риска пациента',
    subtitle: `Интегральный риск (10 лет): ${round1(a.overallRisk)}%`,
    centerValue: `${round1(a.overallRisk)}%`,
    unit: '%',
    segments: withShares(raw),
  };
}
