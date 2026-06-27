/**
 * ============================================================
 * Cox PH — сервисный слой
 * ============================================================
 * Оркестрирует подгонку модели и диагностику в один ответ для API/UI:
 * коэффициенты (β/HR/CI/p), тест пропорциональности (Schoenfeld), C-index,
 * калибровку и персональные кривые выживания для примерных профилей.
 *
 * Чистые вычисления, без обращения к БД — поэтому демо-эндпоинт работает
 * даже без поднятой инфраструктуры.
 */
import { fitCox, survivalCurve, survivalAt, type CoxObservation } from './domain/cox-model.js';
import { proportionalHazardsTest, concordanceIndex, calibrationCurve } from './domain/diagnostics.js';

export interface CoxProfileInput {
  label: string;
  x: number[];
}

export interface CoxAnalysisResult {
  modelVersion: string;
  covariateNames: string[];
  n: number;
  events: number;
  converged: boolean;
  iterations: number;
  logLikelihood: number;
  coefficients: ReturnType<typeof fitCox>['coefficients'];
  cIndex: number;
  phTest: ReturnType<typeof proportionalHazardsTest>;
  calibration: ReturnType<typeof calibrationCurve>;
  baseline: { times: number[]; cumulativeHazard: number[] };
  survival: Array<{
    label: string;
    x: number[];
    curve: Array<{ t: number; survival: number }>;
    horizons: Array<{ label: string; t: number; survival: number }>;
  }>;
}

const MODEL_VERSION = 'cox-ph-1.0.0';
const HORIZONS: Array<{ label: string; t: number }> = [
  { label: '1 год', t: 1 },
  { label: '3 года', t: 3 },
  { label: '5 лет', t: 5 },
];

/** Равномерное прореживание массива до не более чем `max` точек. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]!);
  const last = arr[arr.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Полный анализ Кокса по набору наблюдений и набору профилей для построения
 * кривых выживания.
 */
export function analyzeCox(
  data: CoxObservation[],
  covariateNames: string[],
  profiles: CoxProfileInput[],
  calibrationHorizon = 3,
): CoxAnalysisResult {
  const fit = fitCox(data, { covariateNames });
  const phTest = proportionalHazardsTest(data, fit, covariateNames);
  const cIndex = concordanceIndex(data, fit);
  const calibration = calibrationCurve(data, fit, calibrationHorizon, 5);

  const baseTimes = downsample(fit.baseline.times, 80);
  const baseCum = baseTimes.map((t) => {
    const i = fit.baseline.times.indexOf(t);
    return fit.baseline.cumulativeHazard[i]!;
  });

  const survival = profiles.map((p) => ({
    label: p.label,
    x: p.x,
    curve: downsample(survivalCurve(fit, p.x), 80),
    horizons: HORIZONS.map((h) => ({ label: h.label, t: h.t, survival: round(survivalAt(fit, p.x, h.t), 4) })),
  }));

  return {
    modelVersion: MODEL_VERSION,
    covariateNames,
    n: fit.n,
    events: fit.events,
    converged: fit.converged,
    iterations: fit.iterations,
    logLikelihood: fit.logLikelihood,
    coefficients: fit.coefficients,
    cIndex,
    phTest,
    calibration,
    baseline: { times: baseTimes, cumulativeHazard: baseCum },
    survival,
  };
}

/**
 * Детерминированная демо-когорта (LCG): два предиктора — стандартизованный
 * возраст и бинарный биомаркер — с известным эффектом и точной
 * пропорциональностью рисков. Используется публичным демо-эндпоинтом.
 */
export function demoCohort(seed = 42, n = 500): CoxObservation[] {
  let s = seed >>> 0;
  const rand = (): number => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const betaTrue = [0.9, 0.7];
  const data: CoxObservation[] = [];
  for (let i = 0; i < n; i++) {
    const age = rand() * 2 - 1;
    const bio = rand() < 0.5 ? 0 : 1;
    const lp = betaTrue[0]! * age + betaTrue[1]! * bio;
    const lambda = 0.12 * Math.exp(lp);
    const t = -Math.log(1 - rand()) / lambda;
    const censor = 8;
    data.push({ time: Math.min(t, censor), event: t <= censor ? 1 : 0, x: [age, bio] });
  }
  return data;
}

/** Готовый демо-анализ для лендинга/демонстрации алгоритмов. */
export function coxDemo(): CoxAnalysisResult {
  return analyzeCox(
    demoCohort(),
    ['Возраст (стд.)', 'Биомаркер'],
    [
      { label: 'Низкий риск', x: [-0.8, 0] },
      { label: 'Средний риск', x: [0, 0] },
      { label: 'Высокий риск', x: [0.9, 1] },
    ],
  );
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export const coxService = { analyzeCox, coxDemo, demoCohort };
