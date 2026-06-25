/**
 * ============================================================
 * Слой №3 — Модели временных рядов
 * (Temporal Transformer / Time Series Foundation Models)
 * ============================================================
 *
 * Не только текущий срез, но и ДИНАМИКА определяет прогноз: растущее давление
 * или HbA1c опаснее стабильно повышенных. Из лонгитюдной истории
 * (profile.history) оцениваются тренды ключевых показателей и формируется
 * множитель ускорения temporalAccel ∈ [0.85..1.6], который масштабирует hazard
 * в слое выживаемости. При отсутствии истории множитель = 1 (нейтрально).
 */
import type { LabData } from '../health-profile.js';
import type { DiseaseLinearScore } from './types.js';

export interface TemporalTrend {
  metric: string;
  slopePerYear: number;
  worsening: boolean;
}

/** Линейный тренд (МНК) по парам (возраст, значение). */
function slope(points: Array<[number, number]>): number {
  const n = points.length;
  if (n < 2) return 0;
  const sx = points.reduce((a, [x]) => a + x, 0);
  const sy = points.reduce((a, [, y]) => a + y, 0);
  const sxx = points.reduce((a, [x]) => a + x * x, 0);
  const sxy = points.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return 0;
  return (n * sxy - sx * sy) / denom;
}

const TRACKED: Array<{ key: keyof LabData; label: string; adverseDir: 1 | -1 }> = [
  { key: 'systolicBp', label: 'САД', adverseDir: 1 },
  { key: 'hba1c', label: 'HbA1c', adverseDir: 1 },
  { key: 'ldl', label: 'LDL', adverseDir: 1 },
  { key: 'bmi', label: 'ИМТ', adverseDir: 1 },
  { key: 'egfr', label: 'СКФ', adverseDir: -1 },
];

/**
 * Вычисляет тренды из «сырого» history (до нормировки), возвращает множитель
 * ускорения и перечень ухудшающихся метрик.
 */
export function analyzeTemporal(history: Array<{ ageYears: number; labs?: LabData }> | undefined): {
  accel: number;
  trends: TemporalTrend[];
} {
  if (!history || history.length < 2) return { accel: 1, trends: [] };

  const trends: TemporalTrend[] = [];
  let adverseLoad = 0;

  for (const t of TRACKED) {
    const pts: Array<[number, number]> = history
      .filter((h) => h.labs && h.labs[t.key] !== undefined)
      .map((h) => [h.ageYears, h.labs![t.key] as number]);
    if (pts.length < 2) continue;
    const s = slope(pts);
    const worsening = s * t.adverseDir > 0 && Math.abs(s) > 1e-3;
    trends.push({ metric: t.label, slopePerYear: Math.round(s * 100) / 100, worsening });
    if (worsening) {
      // Нормируем наклон к типичному «опасному» темпу.
      const ref = t.key === 'systolicBp' ? 3 : t.key === 'egfr' ? 2 : 0.2;
      adverseLoad += Math.min(1, Math.abs(s) / ref);
    }
  }

  const accel = Math.min(1.6, Math.max(0.85, 1 + adverseLoad * 0.18));
  return { accel, trends };
}

/** Прикрепляет множитель ускорения ко всем оценкам болезней. */
export function temporalLayer(scores: DiseaseLinearScore[], accel: number): DiseaseLinearScore[] {
  if (accel === 1) return scores;
  return scores.map((s) => ({ ...s, temporalAccel: accel }));
}
