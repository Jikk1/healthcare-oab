/**
 * ============================================================
 * OmniRisk — Оркестратор ансамбля (раздел «ВЫХОД МОДЕЛИ» + «АРХИТЕКТУРА ИИ»)
 * ============================================================
 *
 * Чистая, детерминированная функция верхнего уровня: принимает мультимодальный
 * {@link HealthProfile} и прогоняет его через все шесть слоёв архитектуры,
 * собирая полный отчёт — прогноз по каждому заболеванию на 6 горизонтах,
 * цифровой двойник, продолжительность жизни/здоровья, объяснимость и драйверы.
 *
 * Никакого I/O: это ядро одинаково работает в тестах, на бэкенде и (портированно)
 * на фронтенде.
 */
import type { HealthProfile } from './health-profile.js';
import { normalizeProfile } from './feature-space.js';
import { DISEASES } from './disease-catalog.js';
import { transformerLayer } from './layers/transformer-layer.js';
import { graphLayer } from './layers/graph-layer.js';
import { analyzeTemporal, temporalLayer, type TemporalTrend } from './layers/temporal-layer.js';
import { survivalLayer, type DiseasePrediction } from './layers/survival-layer.js';
import { causalLayer, type CausalAnalysis } from './layers/causal-layer.js';
import { multimodalFusion, type FusionResult } from './layers/multimodal-fusion.js';
import { explain, type Explanation } from './explainability.js';
import { estimateLifeExpectancy, type LifeExpectancyResult } from './life-expectancy.js';
import { buildDigitalTwin, type DigitalTwin } from './digital-twin.js';
import { MODEL_VERSION } from './model-registry.js';

export interface OmniRiskResult {
  modelVersion: string;
  generatedAt: string;
  ageYears: number;
  sex: HealthProfile['sex'];
  healthIndex: number;
  confidence: number;
  completeness: number;
  modalitiesPresent: string[];
  lifeExpectancy: LifeExpectancyResult;
  fusion: FusionResult;
  predictions: DiseasePrediction[];
  causal: Record<string, CausalAnalysis>;
  explanations: Record<string, Explanation>;
  digitalTwin: DigitalTwin;
  temporalTrends: TemporalTrend[];
}

export interface PredictOptions {
  /** ISO-время генерации (по умолчанию — текущее). Параметризуемо для тестов. */
  now?: Date;
  /** Сколько болезней включать в explanations/causal (по 10-летнему риску). */
  detailTopN?: number;
}

export function runOmniRisk(profile: HealthProfile, opts: PredictOptions = {}): OmniRiskResult {
  const now = opts.now ?? new Date();
  const detailTopN = opts.detailTopN ?? 12;

  // --- Нормировка (мультимодальный вектор признаков) ---
  const norm = normalizeProfile(profile);

  // --- Слой №3: анализ временных рядов (множитель ускорения) ---
  const { accel, trends } = analyzeTemporal(profile.history);

  // --- Слой №1: трансформер → линейные предикторы по всем болезням ---
  let scores = DISEASES.map((d) => transformerLayer(norm, d));

  // --- Слой №2: граф механизмов (cross-disease message passing) ---
  scores = graphLayer(scores, norm);

  // --- Слой №3 (применение): ускорение от трендов ---
  scores = temporalLayer(scores, accel);

  // --- Слой №4: выживаемость → мультигоризонтные вероятности ---
  const predictions: DiseasePrediction[] = scores.map((s) =>
    survivalLayer(s, norm.ageYears, norm.completeness),
  );

  // --- Слой №5: причинно-следственный анализ (для топ-болезней) ---
  const prob10 = (p: DiseasePrediction): number => p.horizons.find((h) => h.years === 10)?.probability ?? 0;
  const topScoreIds = new Set(
    [...predictions].sort((a, b) => prob10(b) - prob10(a)).slice(0, detailTopN).map((p) => p.id),
  );
  const causal: Record<string, CausalAnalysis> = {};
  const explanations: Record<string, Explanation> = {};
  let modifiableShareSum = 0;
  let modifiableCount = 0;
  for (const s of scores) {
    if (!topScoreIds.has(s.disease.id)) continue;
    const c = causalLayer(s);
    causal[s.disease.id] = c;
    explanations[s.disease.id] = explain(s, norm);
    modifiableShareSum += c.modifiableSharePct;
    modifiableCount++;
  }
  const modifiableShareAvg = modifiableCount ? modifiableShareSum / modifiableCount : 0;

  // --- Слой №6: мультимодальное объединение ---
  const fusion = multimodalFusion(predictions, norm);

  // --- Производные: продолжительность жизни/здоровья и цифровой двойник ---
  const lifeExpectancy = estimateLifeExpectancy(norm, predictions, modifiableShareAvg);
  const digitalTwin = buildDigitalTwin(norm);

  return {
    modelVersion: MODEL_VERSION,
    generatedAt: now.toISOString(),
    ageYears: norm.ageYears,
    sex: norm.sex,
    healthIndex: fusion.healthIndex,
    confidence: fusion.confidence,
    completeness: norm.completeness,
    modalitiesPresent: norm.modalitiesPresent,
    lifeExpectancy,
    fusion,
    predictions: [...predictions].sort((a, b) => prob10(b) - prob10(a)),
    causal,
    explanations,
    digitalTwin,
    temporalTrends: trends,
  };
}

/**
 * Контрфактическое моделирование вмешательства: пересчитывает прогноз с
 * изменённым профилем и возвращает дельту по ключевым исходам.
 * (раздел «ВЫХОД МОДЕЛИ»: влияние вмешательств на изменение риска)
 */
export interface InterventionDelta {
  baseline: OmniRiskResult;
  modified: OmniRiskResult;
  healthIndexDelta: number;
  lifeExpectancyDelta: number;
  perDisease: Array<{ id: string; name: string; before: number; after: number; reductionPct: number }>;
}

export function simulateIntervention(
  base: HealthProfile,
  overrides: DeepPartial<HealthProfile>,
  opts: PredictOptions = {},
): InterventionDelta {
  const baseline = runOmniRisk(base, opts);
  const merged = deepMerge(base, overrides);
  const modified = runOmniRisk(merged, opts);

  const prob10 = (r: OmniRiskResult, id: string): number =>
    r.predictions.find((p) => p.id === id)?.horizons.find((h) => h.years === 10)?.probability ?? 0;

  const perDisease = baseline.predictions
    .map((p) => {
      const before = prob10(baseline, p.id);
      const after = prob10(modified, p.id);
      return {
        id: p.id,
        name: p.name,
        before,
        after,
        reductionPct: before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : 0,
      };
    })
    .filter((d) => Math.abs(d.before - d.after) > 0.1)
    .sort((a, b) => b.reductionPct - a.reductionPct);

  return {
    baseline,
    modified,
    healthIndexDelta: Math.round((modified.healthIndex - baseline.healthIndex) * 10) / 10,
    lifeExpectancyDelta:
      Math.round((modified.lifeExpectancy.lifeExpectancy - baseline.lifeExpectancy.lifeExpectancy) * 10) / 10,
    perDisease,
  };
}

// --- Утилиты глубокого слияния (для контрфактических оверрайдов) ---

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as T) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    const bv = (base as Record<string, unknown>)[k];
    out[k] = isPlainObject(bv) && isPlainObject(v) ? deepMerge(bv, v as DeepPartial<unknown>) : v;
  }
  return out as T;
}
