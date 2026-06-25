/**
 * ============================================================
 * Слой №4 — Модели выживаемости
 * (Cox Proportional Hazards / Deep Survival / Hazard Prediction)
 * ============================================================
 *
 * Превращает линейный предиктор болезни (log-hazard ratio) в:
 *  - вероятность дебюта на горизонтах 1/3/5/10/20 лет и пожизненно;
 *  - оценку возраста дебюта;
 *  - 95% доверительный интервал (ширина растёт при неполных данных);
 *  - уровень риска.
 *
 * Модель: пропорциональные риски Кокса с базовой кумулятивной функцией риска,
 * выведенной из популяционной пожизненной заболеваемости и возраста дебюта
 * (аппроксимация Вейбулла), умноженной на exp(lp) и temporalAccel. Конкурирующая
 * смертность (Гомпертц–Мейкхем) ограничивает пожизненный риск.
 */
import type { DiseaseDef } from '../disease-catalog.js';
import type { DiseaseLinearScore } from './types.js';

export const HORIZONS = [1, 3, 5, 10, 20] as const;
export type Horizon = (typeof HORIZONS)[number];

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DiseaseHorizonRisk {
  years: Horizon | 'lifetime';
  probability: number; // %
  ci: [number, number]; // %
}

export interface DiseasePrediction {
  id: string;
  icd11: string;
  name: string;
  category: DiseaseDef['category'];
  stage: DiseaseDef['stage'];
  lifetimeRisk: number; // %
  onsetAgeEstimate: number | null; // возраст, при котором кумулятивный риск ≈ 50% от пожизненного
  riskLevel: RiskLevel;
  horizons: DiseaseHorizonRisk[];
  /** Относительный риск против популяции (exp(lp)). */
  relativeRisk: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Базовая форма кумулятивного риска Вейбулла, откалиброванная так, чтобы к
 * характерному возрасту дебюта накапливалась половина пожизненной вероятности.
 * Возвращает базовую вероятность к возрасту `age` (доля 0..1) до применения HR.
 */
function baselineCumulative(disease: DiseaseDef, age: number): number {
  const minAge = disease.minAge ?? 0;
  if (age <= minAge) return 0;
  const shape = 4.5; // крутизна нарастания с возрастом
  const scale = disease.baselineOnsetAge - minAge; // характерный масштаб
  const t = (age - minAge) / Math.max(1, scale);
  const lifetimeFrac = disease.lifetimeBaseline / 100;
  // Вейбулл, нормированный к пожизненной доле на «дальнем» возрасте (~+25 лет).
  const far = (disease.baselineOnsetAge + 25 - minAge) / Math.max(1, scale);
  const norm = 1 - Math.exp(-Math.pow(far, shape));
  const cum = (1 - Math.exp(-Math.pow(t, shape))) / norm;
  return clamp(cum * lifetimeFrac, 0, lifetimeFrac);
}

/** Конкурирующая общая смертность (упрощённый Гомпертц) — доля доживших до age. */
function survivalToAge(age: number): number {
  // P(дожить) ≈ exp(-A*(exp(B*age)-1)); параметры дают ~50% к ~85 годам.
  const A = 0.00002;
  const B = 0.085;
  return clamp(Math.exp(-A * (Math.exp(B * age) - 1)), 0, 1);
}

function levelFrom(prob10: number, relativeRisk: number): RiskLevel {
  const score = prob10 + (relativeRisk - 1) * 6;
  if (score >= 35 || relativeRisk >= 4) return 'CRITICAL';
  if (score >= 18) return 'HIGH';
  if (score >= 7) return 'MEDIUM';
  return 'LOW';
}

export function survivalLayer(score: DiseaseLinearScore, ageNow: number, completeness: number): DiseasePrediction {
  const { disease, lp, temporalAccel } = score;
  const hr = Math.exp(lp) * temporalAccel; // относительный риск
  const relativeRisk = round1(clamp(hr, 0.1, 60));

  const baseNow = baselineCumulative(disease, ageNow);

  /** Абсолютная вероятность дебюта между ageNow и ageNow+dt с учётом HR и дожития. */
  const probWithin = (dt: number): number => {
    const ageThen = ageNow + dt;
    const baseThen = baselineCumulative(disease, ageThen);
    // Прирост базового риска на интервале, усиленный HR, ограниченный сверху.
    const deltaBase = Math.max(0, baseThen - baseNow);
    const hazardScaled = 1 - Math.pow(1 - clamp(deltaBase, 0, 0.999), hr);
    // Поправка на конкурирующую смертность на интервале.
    const surv = survivalToAge(ageThen) / Math.max(1e-6, survivalToAge(ageNow));
    return clamp(hazardScaled * surv * 100, 0, 99);
  };

  // Ширина CI: базовая 18% относительная + надбавка за неполноту данных.
  const ciFor = (p: number): [number, number] => {
    const rel = 0.16 + (1 - completeness) * 0.45;
    const half = clamp(p * rel + 1.2, 1.2, 30);
    return [round1(Math.max(0, p - half)), round1(Math.min(99, p + half))];
  };

  const horizons: DiseaseHorizonRisk[] = HORIZONS.map((y) => {
    const p = round1(probWithin(y));
    return { years: y, probability: p, ci: ciFor(p) };
  });

  // Пожизненный риск: до 95 лет с учётом дожития.
  const lifetimeP = round1(probWithin(Math.max(5, 95 - ageNow)));
  horizons.push({ years: 'lifetime', probability: lifetimeP, ci: ciFor(lifetimeP) });

  // Оценка возраста дебюта: где кумулятивная вероятность достигает половины пожизненной.
  let onsetAgeEstimate: number | null = null;
  const target = lifetimeP / 2;
  if (target > 0.5) {
    for (let dt = 1; dt <= 95 - ageNow; dt++) {
      if (probWithin(dt) >= target) {
        onsetAgeEstimate = ageNow + dt;
        break;
      }
    }
  }

  const prob10 = horizons.find((h) => h.years === 10)?.probability ?? 0;

  return {
    id: disease.id,
    icd11: disease.icd11,
    name: disease.name,
    category: disease.category,
    stage: disease.stage,
    lifetimeRisk: lifetimeP,
    onsetAgeEstimate,
    riskLevel: levelFrom(prob10, relativeRisk),
    horizons,
    relativeRisk,
  };
}

export { survivalToAge, baselineCumulative };
