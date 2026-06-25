/**
 * ============================================================
 * Слой №5 — Причинно-следственный ИИ
 * (Structural Causal Models / Bayesian Networks / Counterfactual Reasoning)
 * ============================================================
 *
 * Корреляция ≠ причина. Этот слой разделяет вклады в риск на:
 *  - КАУЗАЛЬНЫЕ модифицируемые (давление, липиды, курение, гликемия…) — на них
 *    можно повлиять вмешательством, и контрфактический расчёт показывает эффект;
 *  - НЕМОДИФИЦИРУЕМЫЕ/маркерные (возраст, геном, пол) — учитываются, но не
 *    являются целью вмешательства.
 *
 * Контрфактический вопрос «что будет, если привести фактор X к оптимуму?»
 * реализован как пересчёт линейного предиктора с обнулённым причинным вкладом.
 */
import type { DiseaseLinearScore, SignalContribution } from './types.js';

export interface CausalAttribution {
  label: string;
  contribution: number; // доля в линейном предикторе (0..1)
  causal: boolean; // true = модифицируемый причинный фактор
  /** Контрфактическое относительное снижение риска при устранении фактора, %. */
  counterfactualReductionPct: number;
}

export interface CausalAnalysis {
  diseaseId: string;
  drivers: CausalAttribution[];
  /** Суммарная доля риска, объяснимая модифицируемыми причинами, %. */
  modifiableSharePct: number;
}

/** Контрфактическое снижение: 1 - exp(-c) при удалении положительного вклада c. */
function counterfactual(contribution: number): number {
  if (contribution <= 0) return 0;
  return Math.round((1 - Math.exp(-contribution)) * 1000) / 10;
}

export function causalLayer(score: DiseaseLinearScore): CausalAnalysis {
  // Берём только положительные (повышающие риск) вклады.
  const positive = score.contributions.filter((c) => c.value > 0);
  const totalPositive = positive.reduce((a, c) => a + c.value, 0) || 1;

  const drivers: CausalAttribution[] = positive
    .map((c: SignalContribution) => ({
      label: c.label,
      contribution: Math.round((c.value / totalPositive) * 1000) / 1000,
      causal: c.modifiable,
      counterfactualReductionPct: c.modifiable ? counterfactual(c.value) : 0,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const modifiableShare =
    positive.filter((c) => c.modifiable).reduce((a, c) => a + c.value, 0) / totalPositive;

  return {
    diseaseId: score.disease.id,
    drivers,
    modifiableSharePct: Math.round(modifiableShare * 1000) / 10,
  };
}
