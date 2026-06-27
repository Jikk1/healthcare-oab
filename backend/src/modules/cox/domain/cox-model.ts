/**
 * ============================================================
 * Модель пропорциональных рисков Кокса — ядро
 * ============================================================
 *   h(t|x) = h₀(t) · exp(β₁x₁ + … + βₖxₖ)
 *
 * Оценка β — максимизацией частичного правдоподобия Кокса (приближение Бреслоу
 * для совпадающих времён) методом Ньютона–Рафсона. Базовая кумулятивная функция
 * опасности H₀(t) — оценка Бреслоу. Из неё строится персональная функция
 * выживания S(t|x) = exp(−H₀(t) · exp(βx)).
 *
 * Все вычисления детерминированы и не зависят от внешних библиотек.
 * Индексный доступ под `noUncheckedIndexedAccess` читаем через `!` (границы
 * гарантированы), строки матриц захватываем в локальные переменные.
 */
import { invert, matVec, dot, zeros, twoSidedP, type Matrix } from './linalg.js';

export interface CoxObservation {
  /** Время до события или цензурирования (> 0). */
  time: number;
  /** 1 — событие наступило, 0 — наблюдение цензурировано. */
  event: 0 | 1;
  /** Вектор ковариат (одинаковой длины у всех наблюдений). */
  x: number[];
}

export interface CoxCoefficient {
  name: string;
  /** Оценка коэффициента βₖ (= log Hazard Ratio). */
  beta: number;
  /** Стандартная ошибка (из обратной информационной матрицы). */
  se: number;
  /** Отношение рисков HR = exp(β). */
  hazardRatio: number;
  /** 95% доверительный интервал для HR. */
  ci95: [number, number];
  /** Статистика Вальда z = β/se. */
  z: number;
  /** Двусторонний p-value (нормальное приближение). */
  pValue: number;
}

export interface BaselineHazard {
  /** Времёна событий (по возрастанию). */
  times: number[];
  /** Кумулятивная базовая функция опасности H₀(t) в этих точках. */
  cumulativeHazard: number[];
}

export interface CoxFit {
  coefficients: CoxCoefficient[];
  beta: number[];
  /** Обратная информационная матрица (ковариация β) — для диагностики. */
  covariance: Matrix;
  logLikelihood: number;
  iterations: number;
  converged: boolean;
  baseline: BaselineHazard;
  n: number;
  events: number;
}

export interface CoxFitOptions {
  maxIter?: number;
  tol?: number;
  covariateNames?: string[];
  /** Гребневая регуляризация информационной матрицы (стабильность). */
  ridge?: number;
}

/** Линейный предиктор β·x. */
export function linearPredictor(beta: readonly number[], x: readonly number[]): number {
  return dot(beta, x);
}

/**
 * Подгонка модели Кокса. Возвращает коэффициенты с HR/CI/p, базовую функцию
 * опасности (Бреслоу) и ковариацию β.
 */
export function fitCox(data: CoxObservation[], options: CoxFitOptions = {}): CoxFit {
  const { maxIter = 50, tol = 1e-7, ridge = 1e-6 } = options;
  if (data.length === 0) throw new Error('Пустой набор данных');
  const k = data[0]!.x.length;
  if (k === 0) throw new Error('Нужна хотя бы одна ковариата');
  for (const d of data) {
    if (d.x.length !== k) throw new Error('Разная длина векторов ковариат');
    if (!(d.time > 0)) throw new Error('Время должно быть положительным');
  }
  const names = options.covariateNames ?? Array.from({ length: k }, (_, i) => `x${i + 1}`);

  // Сортировка по времени (по возрастанию).
  const obs = [...data].sort((a, b) => a.time - b.time);
  const n = obs.length;
  const totalEvents = obs.reduce((s, o) => s + o.event, 0);
  if (totalEvents === 0) throw new Error('Нет ни одного события — модель не определена');

  const beta = new Array<number>(k).fill(0);
  let logLik = 0;
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    logLik = 0;
    const score = new Array<number>(k).fill(0); // U(β)
    const info: Matrix = zeros(k, k); // I(β)

    // Накопление риск-множеств «справа налево»: R(t) = { j : time_j ≥ t }.
    let s0 = 0;
    const s1 = new Array<number>(k).fill(0);
    const s2: Matrix = zeros(k, k);
    let i = n - 1;

    while (i >= 0) {
      const t = obs[i]!.time;
      let d = 0; // число событий при t
      const sumXEvents = new Array<number>(k).fill(0); // Σ x по событиям при t
      while (i >= 0 && obs[i]!.time === t) {
        const o = obs[i]!;
        const w = Math.exp(dot(beta, o.x));
        s0 += w;
        for (let a = 0; a < k; a++) {
          const xa = o.x[a]!;
          s1[a] = s1[a]! + w * xa;
          const s2a = s2[a]!;
          for (let b = 0; b < k; b++) s2a[b] = s2a[b]! + w * xa * o.x[b]!;
        }
        if (o.event === 1) {
          d++;
          for (let a = 0; a < k; a++) sumXEvents[a] = sumXEvents[a]! + o.x[a]!;
        }
        i--;
      }
      if (d === 0) continue;

      // Вклад этого времени (приближение Бреслоу для совпадений).
      logLik += dot(beta, sumXEvents) - d * Math.log(s0);
      for (let a = 0; a < k; a++) {
        const meanA = s1[a]! / s0;
        score[a] = score[a]! + sumXEvents[a]! - d * meanA;
        const infoA = info[a]!;
        const s2a = s2[a]!;
        for (let b = 0; b < k; b++) infoA[b] = infoA[b]! + d * (s2a[b]! / s0 - meanA * (s1[b]! / s0));
      }
    }

    // Гребневая стабилизация диагонали.
    for (let a = 0; a < k; a++) info[a]![a] = info[a]![a]! + ridge;

    const cov = invert(info);
    const delta = matVec(cov, score); // шаг Ньютона
    let maxStep = 0;
    for (let a = 0; a < k; a++) {
      beta[a] = beta[a]! + delta[a]!;
      maxStep = Math.max(maxStep, Math.abs(delta[a]!));
    }
    if (maxStep < tol) {
      converged = true;
      break;
    }
  }

  // Финальная ковариация при найденном β.
  const covariance = computeCovariance(obs, beta, k, ridge);
  const se = covariance.map((row, a) => Math.sqrt(Math.max(row[a]!, 0)));

  const coefficients: CoxCoefficient[] = beta.map((b, a) => {
    const sa = se[a]!;
    const z = sa > 0 ? b / sa : 0;
    return {
      name: names[a]!,
      beta: round(b, 6),
      se: round(sa, 6),
      hazardRatio: round(Math.exp(b), 6),
      ci95: [round(Math.exp(b - 1.96 * sa), 6), round(Math.exp(b + 1.96 * sa), 6)],
      z: round(z, 4),
      pValue: round(twoSidedP(z), 6),
    };
  });

  const baseline = breslowBaseline(obs, beta);

  return {
    coefficients,
    beta: beta.map((b) => round(b, 8)),
    covariance,
    logLikelihood: round(logLik, 6),
    iterations,
    converged,
    baseline,
    n,
    events: totalEvents,
  };
}

/** Информационная матрица I(β) и её обращение при заданном β. */
function computeCovariance(obs: CoxObservation[], beta: number[], k: number, ridge: number): Matrix {
  const info: Matrix = zeros(k, k);
  const n = obs.length;
  let s0 = 0;
  const s1 = new Array<number>(k).fill(0);
  const s2: Matrix = zeros(k, k);
  let i = n - 1;
  while (i >= 0) {
    const t = obs[i]!.time;
    let d = 0;
    while (i >= 0 && obs[i]!.time === t) {
      const o = obs[i]!;
      const w = Math.exp(dot(beta, o.x));
      s0 += w;
      for (let a = 0; a < k; a++) {
        const xa = o.x[a]!;
        s1[a] = s1[a]! + w * xa;
        const s2a = s2[a]!;
        for (let b = 0; b < k; b++) s2a[b] = s2a[b]! + w * xa * o.x[b]!;
      }
      if (o.event === 1) d++;
      i--;
    }
    if (d === 0) continue;
    for (let a = 0; a < k; a++) {
      const meanA = s1[a]! / s0;
      const infoA = info[a]!;
      const s2a = s2[a]!;
      for (let b = 0; b < k; b++) infoA[b] = infoA[b]! + d * (s2a[b]! / s0 - meanA * (s1[b]! / s0));
    }
  }
  for (let a = 0; a < k; a++) info[a]![a] = info[a]![a]! + ridge;
  return invert(info);
}

/** Оценка Бреслоу базовой кумулятивной функции опасности H₀(t). */
function breslowBaseline(obs: CoxObservation[], beta: number[]): BaselineHazard {
  const n = obs.length;
  const times: number[] = [];
  const cumulativeHazard: number[] = [];
  let cum = 0;

  const w = obs.map((o) => Math.exp(dot(beta, o.x)));
  // Суффиксные суммы exp(βx): suffixSum[i] = Σ_{j ≥ i} w_j = риск-множество для obs[i].time.
  const suffixSum = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixSum[i] = suffixSum[i + 1]! + w[i]!;

  let idx = 0;
  while (idx < n) {
    const t = obs[idx]!.time;
    const riskSum = suffixSum[idx]!; // Σ exp(βx) по {time ≥ t}
    let d = 0;
    let j = idx;
    while (j < n && obs[j]!.time === t) {
      if (obs[j]!.event === 1) d++;
      j++;
    }
    if (d > 0) {
      cum += d / riskSum;
      times.push(round(t, 6));
      cumulativeHazard.push(round(cum, 8));
    }
    idx = j;
  }
  return { times, cumulativeHazard };
}

/**
 * Кумулятивная базовая опасность H₀(t) в произвольный момент t
 * (ступенчатая функция: значение последнего события ≤ t).
 */
export function baselineHazardAt(baseline: BaselineHazard, t: number): number {
  const { times, cumulativeHazard } = baseline;
  if (times.length === 0 || t < times[0]!) return 0;
  let lo = 0;
  let hi = times.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) {
      ans = cumulativeHazard[mid]!;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Функция выживания S(t|x) = exp(−H₀(t) · exp(βx)). */
export function survivalAt(fit: CoxFit, x: number[], t: number): number {
  const h0 = baselineHazardAt(fit.baseline, t);
  return Math.exp(-h0 * Math.exp(linearPredictor(fit.beta, x)));
}

/** Полная персональная кривая выживания в заданных точках времени. */
export function survivalCurve(fit: CoxFit, x: number[], atTimes?: number[]): Array<{ t: number; survival: number }> {
  const ts = atTimes ?? fit.baseline.times;
  const lp = Math.exp(linearPredictor(fit.beta, x));
  return ts.map((t) => ({ t: round(t, 6), survival: round(Math.exp(-baselineHazardAt(fit.baseline, t) * lp), 6) }));
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
