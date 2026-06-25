/**
 * ============================================================
 * Слой №1 — Трансформеры медицинских данных
 * (EHR Transformer / Longitudinal Health Transformer / Clinical Foundation Model)
 * ============================================================
 *
 * Концептуально трансформер строит контекстное представление пациента, взвешивая
 * его признаки. В детерминированной реализации это «обучающее представление»
 * сворачивается в линейный предиктор болезни: скалярное произведение вектора
 * чувствительностей болезни (из каталога) на нормированный вектор сигналов
 * пациента, плюс вклад полигенного риска, моногенных находок и семейного
 * анамнеза. Каждый член сохраняется отдельно — это и есть «attention» для XAI.
 */
import type { DiseaseDef } from '../disease-catalog.js';
import type { NormalizedProfile } from '../feature-space.js';
import {
  isModifiable,
  SIGNAL_LABELS,
  type DiseaseLinearScore,
  type SignalContribution,
} from './types.js';

export function transformerLayer(
  profile: NormalizedProfile,
  disease: DiseaseDef,
): DiseaseLinearScore {
  const contributions: SignalContribution[] = [];
  let lp = 0;

  // Базовое взвешивание сигналов чувствительностями болезни.
  for (const [key, weight] of Object.entries(disease.weights)) {
    const signalKey = key as keyof typeof profile.signals;
    const signalValue = profile.signals[signalKey] ?? 0;
    const contribution = signalValue * (weight ?? 0) * 0.1; // масштаб в log-hazard
    if (Math.abs(contribution) < 1e-6) continue;
    lp += contribution;
    contributions.push({
      signal: signalKey,
      label: SIGNAL_LABELS[signalKey],
      value: contribution,
      modifiable: isModifiable(signalKey),
    });
  }

  // Полигенный риск-скор именно этой категории (z-оценка) усиливает базу.
  const prsZ = profile.prs[disease.category];
  if (typeof prsZ === 'number' && prsZ !== 0) {
    const c = prsZ * 0.22;
    lp += c;
    contributions.push({ signal: 'prs', label: `PRS · ${disease.category}`, value: c, modifiable: false });
  }

  // Моногенные патогенные варианты — резкий сдвиг для редких/наследственных форм.
  if (profile.monogenic.length && (disease.category === 'RARE' || disease.category === 'ONCOLOGY' || disease.category === 'CARDIOVASCULAR')) {
    const c = Math.min(profile.monogenic.length, 3) * 0.35;
    lp += c;
    contributions.push({ signal: 'monogenic', label: `Моногенные варианты (${profile.monogenic.length})`, value: c, modifiable: false });
  }

  // Семейный анамнез по категории.
  const affected = profile.family[disease.category] ?? 0;
  if (affected > 0) {
    const c = Math.min(affected, 3) * 0.18;
    lp += c;
    contributions.push({ signal: 'family', label: `Семейный анамнез (${affected})`, value: c, modifiable: false });
  }

  // Половой модификатор.
  const sexAdj =
    disease.sexFactor === 1
      ? 0
      : profile.sex === 'MALE'
        ? Math.log(disease.sexFactor)
        : profile.sex === 'FEMALE'
          ? Math.log(1 / disease.sexFactor)
          : 0;
  if (sexAdj !== 0) {
    lp += sexAdj;
    contributions.push({ signal: 'sex', label: 'Пол', value: sexAdj, modifiable: false });
  }

  return { disease, lp, contributions, temporalAccel: 1 };
}
