/**
 * ============================================================
 * Слой №6 — Мультимодальные модели (объединение модальностей)
 * ============================================================
 *
 * Финальная калибровка и агрегирование. Объединяет:
 *  - текст/ЭМК, изображения (результаты), геном, биомаркеры, сигналы сенсоров —
 *    все они уже свёрнуты в линейные предикторы предыдущими слоями;
 *  - вычисляет ИНТЕГРАЛЬНЫЙ индекс здоровья пациента и агрегированные риски по
 *    укрупнённым доменам (для совместимости с существующим дашбордом);
 *  - оценивает общую уверенность прогноза по полноте модальностей.
 */
import type { NormalizedProfile } from '../feature-space.js';
import type { DiseasePrediction } from './survival-layer.js';

export interface FusionResult {
  /** Интегральный индекс здоровья 0..100 (выше — лучше). */
  healthIndex: number;
  /** Общая уверенность модели 0..1. */
  confidence: number;
  /** Топ-риски (по 10-летней вероятности). */
  topRisks: DiseasePrediction[];
  /** Агрегаты по доменам для виджетов дашборда (10-летний риск, %). */
  domains: {
    cardiovascular: number;
    metabolic: number;
    oncologic: number;
    neuro: number;
    renal: number;
    respiratory: number;
  };
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function prob10(p: DiseasePrediction): number {
  return p.horizons.find((h) => h.years === 10)?.probability ?? 0;
}

/** Максимальный 10-летний риск среди болезней категории. */
function domainMax(preds: DiseasePrediction[], categories: string[]): number {
  const vals = preds.filter((p) => categories.includes(p.category)).map(prob10);
  return vals.length ? round1(Math.max(...vals)) : 0;
}

export function multimodalFusion(
  preds: DiseasePrediction[],
  profile: NormalizedProfile,
): FusionResult {
  const sorted = [...preds].sort((a, b) => prob10(b) - prob10(a));

  // Индекс здоровья: 100 минус взвешенная сумма наиболее тяжёлых рисков и
  // ускорения биологического возраста.
  const burden = sorted.slice(0, 6).reduce((a, p) => a + prob10(p), 0) / 6;
  const bioPenalty = Math.max(0, profile.signals.bioAgeAccel) * 0.8;
  const healthIndex = round1(Math.max(1, Math.min(100, 100 - burden * 1.1 - bioPenalty)));

  // Уверенность: насыщающаяся функция полноты данных.
  const confidence = Math.round((0.35 + 0.6 * profile.completeness) * 100) / 100;

  return {
    healthIndex,
    confidence,
    topRisks: sorted.slice(0, 8),
    domains: {
      cardiovascular: domainMax(preds, ['CARDIOVASCULAR']),
      metabolic: domainMax(preds, ['ENDOCRINE']),
      oncologic: domainMax(preds, ['ONCOLOGY']),
      neuro: domainMax(preds, ['NEUROLOGICAL', 'PSYCHIATRIC']),
      renal: domainMax(preds, ['RENAL']),
      respiratory: domainMax(preds, ['RESPIRATORY']),
    },
  };
}
