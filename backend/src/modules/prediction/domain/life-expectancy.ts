/**
 * ============================================================
 * OmniRisk — Продолжительность жизни и здоровья
 * (раздел «ОСНОВНАЯ ЦЕЛЬ»: ожидаемая продолжительность здоровой жизни,
 *  ожидаемая продолжительность жизни, риски инвалидизации)
 * ============================================================
 *
 * На основе интегральной нагрузки рисков и ускорения биологического возраста
 * оценивает:
 *  - ожидаемую продолжительность жизни (life expectancy);
 *  - ожидаемую продолжительность ЗДОРОВОЙ жизни (healthspan, без тяжёлой
 *    хронической болезни/инвалидности);
 *  - годы потенциальной жизни, теряемые из-за модифицируемых факторов;
 *  - агрегированный риск инвалидизации на 10 лет.
 *
 * Базовая когортная продолжительность ~83 года корректируется на относительную
 * избыточную смертность (через средневзвешенный относительный риск тяжёлых
 * болезней) и биологический возраст.
 */
import type { NormalizedProfile } from './feature-space.js';
import type { DiseasePrediction } from './layers/survival-layer.js';

export interface LifeExpectancyResult {
  lifeExpectancy: number; // ожидаемый возраст смерти
  healthspan: number; // ожидаемый возраст утраты здоровья
  yearsOfLifeLostModifiable: number; // потенциально возвращаемые годы
  disabilityRisk10y: number; // %, риск инвалидизации за 10 лет
  biologicalAge: number;
}

const BASELINE_LIFE_EXPECTANCY = 83; // когортная база, годы
const round1 = (v: number): number => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Болезни, наиболее влияющие на смертность/инвалидизацию, с весами. */
const MORTALITY_WEIGHTS: Record<string, number> = {
  ihd: 1.0,
  stroke: 0.9,
  hf: 0.8,
  lung_ca: 1.0,
  colorectal_ca: 0.7,
  breast_ca: 0.6,
  prostate_ca: 0.5,
  t2dm: 0.6,
  ckd: 0.7,
  copd: 0.7,
  cirrhosis: 0.8,
  alzheimer: 0.8,
  parkinson: 0.6,
};

const DISABILITY_WEIGHTS: Record<string, number> = {
  stroke: 1.0,
  alzheimer: 1.0,
  parkinson: 0.9,
  osteoporosis: 0.7,
  ckd: 0.6,
  hf: 0.6,
  copd: 0.6,
  depression: 0.7,
  amd: 0.5,
};

export function estimateLifeExpectancy(
  profile: NormalizedProfile,
  predictions: DiseasePrediction[],
  modifiableShareAvg: number,
): LifeExpectancyResult {
  const byId = new Map(predictions.map((p) => [p.id, p]));

  // Избыточная смертность: средневзвешенный (RR-1) по тяжёлым болезням.
  let excess = 0;
  let wsum = 0;
  for (const [id, w] of Object.entries(MORTALITY_WEIGHTS)) {
    const p = byId.get(id);
    if (!p) continue;
    excess += w * Math.max(0, p.relativeRisk - 1) * (p.horizons.find((h) => h.years === 10)?.probability ?? 0) / 100;
    wsum += w;
  }
  const excessMortality = wsum ? excess / wsum : 0; // ~0..1+

  const bioAccel = profile.signals.bioAgeAccel;
  const biologicalAge = Math.round(profile.ageYears + clamp(bioAccel, -10, 20));

  // Каждая единица избыточной смертности ~ -9 лет; биол. возраст ~ -0.5 года/год.
  const lifeExpectancy = round1(
    clamp(BASELINE_LIFE_EXPECTANCY - excessMortality * 9 - Math.max(0, bioAccel) * 0.5, profile.ageYears + 1, 100),
  );

  // Healthspan: обычно на 8–12 лет короче ОПЖ, сильнее страдает от модиф. факторов.
  const lifestyleBurden =
    (profile.signals.smoking + profile.signals.adiposity + profile.signals.inactivity + profile.signals.glycemia) / 4;
  const healthspan = round1(
    clamp(lifeExpectancy - 9 - Math.max(0, lifestyleBurden) * 4, profile.ageYears, lifeExpectancy),
  );

  // Возвращаемые годы: часть разрыва, объяснимая модифицируемыми причинами.
  const yearsOfLifeLostModifiable = round1(
    clamp((BASELINE_LIFE_EXPECTANCY - lifeExpectancy) * clamp(modifiableShareAvg / 100, 0, 1), 0, 25),
  );

  // Риск инвалидизации за 10 лет: насыщающая агрегация по DISABILITY_WEIGHTS.
  let disabilityLoad = 0;
  for (const [id, w] of Object.entries(DISABILITY_WEIGHTS)) {
    const p = byId.get(id);
    if (!p) continue;
    disabilityLoad += w * (p.horizons.find((h) => h.years === 10)?.probability ?? 0) / 100;
  }
  const disabilityRisk10y = round1(clamp((1 - Math.exp(-disabilityLoad)) * 100, 0, 95));

  return {
    lifeExpectancy,
    healthspan,
    yearsOfLifeLostModifiable,
    disabilityRisk10y,
    biologicalAge,
  };
}
