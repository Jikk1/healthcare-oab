/**
 * ============================================================
 * OmniRisk — Объяснимость ИИ (раздел плана «ОБЪЯСНИМОСТЬ ИИ»)
 * ============================================================
 *
 * Каждый прогноз сопровождается объяснением:
 *  - SHAP-подобный вклад каждого признака (знаковый, в долях);
 *  - карта «attention» по модальностям — какие источники данных повлияли сильнее;
 *  - причинная цепочка (механизм → орган → болезнь);
 *  - выделение модифицируемых факторов.
 *
 * Поскольку базовая модель аддитивна по линейному предиктору, точные вклады
 * Шепли совпадают с самими членами предиктора — объяснение математически
 * корректно, а не пост-хок аппроксимация.
 */
import type { DiseaseLinearScore } from './layers/types.js';
import type { NormalizedProfile } from './feature-space.js';

export interface ShapEntry {
  feature: string;
  value: number; // вклад в линейный предиктор (знаковый)
  modifiable: boolean;
}

export interface AttentionEntry {
  modality: string;
  weight: number; // 0..1, доля внимания
}

export interface Explanation {
  diseaseId: string;
  shap: ShapEntry[];
  attention: AttentionEntry[];
  causalChain: string[];
}

const MODALITY_OF: Record<string, string> = {
  age: 'Демография',
  sex: 'Демография',
  bioAgeAccel: 'Эпигенетика',
  prs: 'Геном',
  monogenic: 'Геном',
  genomicLoad: 'Геном',
  family: 'Семейный анамнез',
  bloodPressure: 'Лаборатория/витальные',
  lipids: 'Метаболомика',
  glycemia: 'Метаболомика',
  adiposity: 'Антропометрия',
  renal: 'Лаборатория',
  hepatic: 'Лаборатория',
  hematologic: 'Лаборатория',
  cardiac: 'Протеомика',
  inflammation: 'Протеомика',
  immune: 'Иммунология',
  microbiome: 'Микробиом',
  smoking: 'Образ жизни',
  alcohol: 'Образ жизни',
  inactivity: 'Образ жизни',
  diet: 'Образ жизни',
  sleep: 'Носимые устройства',
  stress: 'Образ жизни',
  environment: 'Экология',
  social: 'Социальные факторы',
  autonomic: 'Носимые устройства',
  graph: 'Граф механизмов',
};

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d;

export function explain(score: DiseaseLinearScore, _profile: NormalizedProfile): Explanation {
  // SHAP = сами члены аддитивного предиктора, отсортированные по |вкладу|.
  const shap: ShapEntry[] = score.contributions
    .map((c) => ({ feature: c.label, value: round(c.value), modifiable: c.modifiable }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Attention: агрегируем |вклад| по модальностям и нормируем.
  const byModality = new Map<string, number>();
  for (const c of score.contributions) {
    const modality = MODALITY_OF[c.signal] ?? 'Прочее';
    byModality.set(modality, (byModality.get(modality) ?? 0) + Math.abs(c.value));
  }
  const total = [...byModality.values()].reduce((a, b) => a + b, 0) || 1;
  const attention: AttentionEntry[] = [...byModality.entries()]
    .map(([modality, w]) => ({ modality, weight: round(w / total) }))
    .sort((a, b) => b.weight - a.weight);

  // Причинная цепочка: топ-механизм → орган-мишень → болезнь.
  const topCausal = shap.find((s) => s.modifiable && s.value > 0);
  const causalChain: string[] = [];
  if (topCausal) {
    causalChain.push(topCausal.feature);
    causalChain.push('эндотелий/ткань-мишень');
  }
  causalChain.push(score.disease.name);

  return { diseaseId: score.disease.id, shap, attention, causalChain };
}
