/**
 * ============================================================
 * Cox PH — диагностика и валидация
 * ============================================================
 *  - Остатки Шёнфельда и тест гипотезы пропорциональности рисков
 *    (корреляция остатков со временем; p — асимптотическое приближение).
 *  - Индекс конкордантности Харрелла (C-index).
 *  - Калибровочная кривая (предсказанная vs наблюдаемая частота событий).
 */
import { dot, twoSidedP } from './linalg.js';
import { baselineHazardAt, type CoxFit, type CoxObservation } from './cox-model.js';

export interface PHTestResult {
  name: string;
  /** Корреляция остатков Шёнфельда со временем (по событиям). */
  correlation: number;
  /** Двусторонний p-value (Fisher z-преобразование). */
  pValue: number;
  /** true ⇒ допущение пропорциональности нарушено (p < 0.05). */
  violated: boolean;
}

export interface PHTest {
  perCovariate: PHTestResult[];
  anyViolation: boolean;
  recommendation: string;
}

/**
 * Остатки Шёнфельда: для каждого события i и ковариаты k
 *   r_ik = x_ik − x̄_k(t_i),   x̄_k = Σ_{j∈R} w_j x_jk / Σ_{j∈R} w_j.
 * PH-тест: корреляция r_·k со временем события. Сильная корреляция ⇒
 * вклад ковариаты меняется во времени ⇒ нарушение пропорциональности.
 */
export function proportionalHazardsTest(data: CoxObservation[], fit: CoxFit, names?: string[]): PHTest {
  const k = fit.beta.length;
  const obs = [...data].sort((a, b) => a.time - b.time);
  const n = obs.length;
  const beta = fit.beta;
  const cov = names ?? fit.coefficients.map((c) => c.name);

  const eventTimes: number[] = [];
  const residuals: number[][] = []; // [event][k]

  // Суффиксные суммы для риск-множеств R(t) = { time ≥ t }.
  const w = obs.map((o) => Math.exp(dot(beta, o.x)));
  const sufW = new Array<number>(n + 1).fill(0);
  const sufWX: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(k).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    sufW[i] = sufW[i + 1]! + w[i]!;
    const cur = sufWX[i]!;
    const nxt = sufWX[i + 1]!;
    const xi = obs[i]!.x;
    for (let a = 0; a < k; a++) cur[a] = nxt[a]! + w[i]! * xi[a]!;
  }

  let idx = 0;
  while (idx < n) {
    const t = obs[idx]!.time;
    const riskW = sufW[idx]!;
    const sufRow = sufWX[idx]!;
    const xbar = new Array<number>(k);
    for (let a = 0; a < k; a++) xbar[a] = sufRow[a]! / riskW;
    let j = idx;
    while (j < n && obs[j]!.time === t) {
      const o = obs[j]!;
      if (o.event === 1) {
        eventTimes.push(t);
        residuals.push(o.x.map((xv, a) => xv - xbar[a]!));
      }
      j++;
    }
    idx = j;
  }

  const m = eventTimes.length;
  const perCovariate: PHTestResult[] = [];
  for (let a = 0; a < k; a++) {
    const r = residuals.map((row) => row[a]!);
    const corr = pearson(eventTimes, r);
    let p = 1;
    if (m > 3 && Math.abs(corr) < 1) {
      const z = Math.atanh(corr) * Math.sqrt(m - 3);
      p = twoSidedP(z);
    }
    perCovariate.push({
      name: cov[a]!,
      correlation: round(corr, 4),
      pValue: round(p, 6),
      violated: p < 0.05,
    });
  }

  const anyViolation = perCovariate.some((c) => c.violated);
  const violatedNames = perCovariate.filter((c) => c.violated).map((c) => c.name);
  const recommendation = anyViolation
    ? `Нарушение пропорциональности: ${violatedNames.join(', ')}. Рекомендуется стратификация по этим ковариатам или ввод время-зависимых коэффициентов β(t).`
    : 'Допущение пропорциональности рисков выполняется для всех ковариат.';

  return { perCovariate, anyViolation, recommendation };
}

/** Корреляция Пирсона. */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den < 1e-12 ? 0 : num / den;
}

const mean = (arr: number[]): number => arr.reduce((s, v) => s + v, 0) / arr.length;

/**
 * Индекс конкордантности Харрелла (C-index): доля корректно упорядоченных по
 * риску сравнимых пар. 0.5 — случайно, 1.0 — идеально.
 * risk = линейный предиктор βx (выше ⇒ событие раньше).
 */
export function concordanceIndex(data: CoxObservation[], fit: CoxFit): number {
  const beta = fit.beta;
  const risk = data.map((o) => dot(beta, o.x));
  let concordant = 0;
  let comparable = 0;
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i]!;
      const b = data[j]!;
      let earlier: number;
      let later: number;
      if (a.time < b.time) {
        if (a.event !== 1) continue;
        earlier = i;
        later = j;
      } else if (b.time < a.time) {
        if (b.event !== 1) continue;
        earlier = j;
        later = i;
      } else {
        if (a.event === 1 && b.event === 1) {
          comparable++;
          concordant += 0.5;
        }
        continue;
      }
      comparable++;
      const re = risk[earlier]!;
      const rl = risk[later]!;
      if (re > rl) concordant += 1;
      else if (re === rl) concordant += 0.5;
    }
  }
  return comparable === 0 ? 0.5 : round(concordant / comparable, 4);
}

export interface CalibrationBin {
  predicted: number; // средняя предсказанная вероятность события к horizon
  observed: number; // наблюдаемая частота (Каплан–Майер) к horizon
  count: number;
}

/**
 * Калибровка к горизонту horizon: наблюдения делятся на bins групп по
 * предсказанной вероятности события; в каждой сравнивается средняя
 * предсказанная вероятность с наблюдаемой (1 − KM(horizon)).
 */
export function calibrationCurve(data: CoxObservation[], fit: CoxFit, horizon: number, bins = 5): CalibrationBin[] {
  const h0 = baselineHazardAt(fit.baseline, horizon);
  const scored = data.map((o) => ({ o, pred: 1 - Math.exp(-h0 * Math.exp(dot(fit.beta, o.x))) }));
  scored.sort((a, b) => a.pred - b.pred);

  const out: CalibrationBin[] = [];
  const size = Math.ceil(scored.length / bins);
  for (let b = 0; b < bins; b++) {
    const slice = scored.slice(b * size, (b + 1) * size);
    if (slice.length === 0) continue;
    const predicted = mean(slice.map((s) => s.pred));
    const observed = 1 - kaplanMeierAt(slice.map((s) => s.o), horizon);
    out.push({ predicted: round(predicted, 4), observed: round(observed, 4), count: slice.length });
  }
  return out;
}

/** Оценка Каплана–Майера выживаемости S(horizon) для подвыборки. */
function kaplanMeierAt(obs: CoxObservation[], horizon: number): number {
  const sorted = [...obs].sort((a, b) => a.time - b.time);
  let surv = 1;
  let i = 0;
  const n = sorted.length;
  let atRisk = n;
  while (i < n) {
    const t = sorted[i]!.time;
    let d = 0;
    let censored = 0;
    let j = i;
    while (j < n && sorted[j]!.time === t) {
      if (sorted[j]!.event === 1) d++;
      else censored++;
      j++;
    }
    if (t <= horizon) {
      if (d > 0) surv *= 1 - d / atRisk;
      atRisk -= d + censored;
    } else break;
    i = j;
  }
  return surv;
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
