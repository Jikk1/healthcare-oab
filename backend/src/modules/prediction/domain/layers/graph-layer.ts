/**
 * ============================================================
 * Слой №2 — Графовые нейронные сети
 * Граф: Пациент ↔ Ген ↔ Белок ↔ Метаболит ↔ Орган ↔ Болезнь ↔ Лекарство
 * ============================================================
 *
 * Биологические процессы разделяются между болезнями: хроническое воспаление
 * связывает атеросклероз, онкогенез и нейродегенерацию; инсулинорезистентность
 * связывает СД2, НАЖБП и ССЗ. Полносвязную GNN заменяет детерминированное
 * распространение по знаниевому графу «узлов-механизмов»: активность узла
 * (агрегированный сигнал) добавляет надбавку к линейному предиктору всех
 * связанных с ним болезней. Это «message passing» в один проход.
 */
import type { NormalizedProfile } from '../feature-space.js';
import type { DiseaseLinearScore, SignalContribution } from './types.js';

/** Узел-механизм графа: имя + как он активируется из сигналов пациента. */
interface MechanismNode {
  id: string;
  label: string;
  activation: (p: NormalizedProfile) => number; // 0..~3
  /** Категории болезней, на которые узел распространяет активность, и сила связи. */
  edges: Partial<Record<string, number>>;
  modifiable: boolean;
}

const MECHANISMS: MechanismNode[] = [
  {
    id: 'inflammation',
    label: 'Системное воспаление (IL-6 / CRP / микробиом)',
    activation: (p) => p.signals.inflammation,
    edges: { CARDIOVASCULAR: 0.18, ONCOLOGY: 0.16, NEUROLOGICAL: 0.14, AUTOIMMUNE: 0.2, HEPATIC: 0.12, RENAL: 0.1 },
    modifiable: true,
  },
  {
    id: 'insulin_resistance',
    label: 'Инсулинорезистентность (метаболический узел)',
    activation: (p) => (p.signals.glycemia + p.signals.adiposity) / 2,
    edges: { ENDOCRINE: 0.22, CARDIOVASCULAR: 0.14, HEPATIC: 0.18, ONCOLOGY: 0.08, RENAL: 0.1 },
    modifiable: true,
  },
  {
    id: 'endothelial',
    label: 'Эндотелиальная дисфункция (АД / липиды)',
    activation: (p) => (p.signals.bloodPressure + p.signals.lipids) / 2,
    edges: { CARDIOVASCULAR: 0.2, RENAL: 0.14, OPHTHALMIC: 0.1, NEUROLOGICAL: 0.08 },
    modifiable: true,
  },
  {
    id: 'genomic',
    label: 'Геномная предрасположенность (общие локусы)',
    activation: (p) => p.signals.genomicLoad,
    edges: { ONCOLOGY: 0.12, CARDIOVASCULAR: 0.08, AUTOIMMUNE: 0.12, NEUROLOGICAL: 0.1, RARE: 0.2 },
    modifiable: false,
  },
  {
    id: 'senescence',
    label: 'Клеточное старение (эпигенетические часы)',
    activation: (p) => Math.max(0, p.signals.bioAgeAccel) / 8,
    edges: { CARDIOVASCULAR: 0.1, ONCOLOGY: 0.12, NEUROLOGICAL: 0.14, MUSCULOSKELETAL: 0.12, OPHTHALMIC: 0.1 },
    modifiable: true,
  },
  {
    id: 'autonomic',
    label: 'Вегетативный дисбаланс (ВСР / пульс)',
    activation: (p) => p.signals.autonomic,
    edges: { CARDIOVASCULAR: 0.1, PSYCHIATRIC: 0.1 },
    modifiable: true,
  },
];

/**
 * Применяет распространение по графу к набору линейных оценок болезней.
 * Возвращает НОВЫЙ массив (чистая функция), добавляя вклад 'graph' к каждой.
 */
export function graphLayer(
  scores: DiseaseLinearScore[],
  profile: NormalizedProfile,
): DiseaseLinearScore[] {
  // Предрассчитать активность узлов один раз.
  const active = MECHANISMS.map((m) => ({ node: m, a: Math.max(0, m.activation(profile)) }));

  return scores.map((s) => {
    let graphBoost = 0;
    const detail: string[] = [];
    for (const { node, a } of active) {
      const edge = node.edges[s.disease.category];
      if (!edge || a <= 0) continue;
      const c = a * edge;
      graphBoost += c;
      if (c > 0.02) detail.push(node.label);
    }
    if (graphBoost <= 1e-6) return s;

    const contribution: SignalContribution = {
      signal: 'graph',
      label: `Граф механизмов: ${detail.slice(0, 2).join(', ') || 'связанные процессы'}`,
      value: graphBoost,
      modifiable: true,
    };
    return {
      ...s,
      lp: s.lp + graphBoost,
      contributions: [...s.contributions, contribution],
    };
  });
}
