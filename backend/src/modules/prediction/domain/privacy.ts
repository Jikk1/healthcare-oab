/**
 * ============================================================
 * OmniRisk — Приватность и этика (раздел плана «БЕЗОПАСНОСТЬ И ЭТИКА»)
 * ============================================================
 *
 * Утилиты приватности уровня домена, дополняющие шифрование PHI и контроль
 * доступа на уровне инфраструктуры:
 *  - анонимизация профиля (удаление прямых идентификаторов, генерализация);
 *  - дифференциальная приватность (механизм Лапласа) для агрегатов;
 *  - оценка k-анонимности квазиидентификаторов;
 *  - флаг чувствительности генетических данных.
 *
 * Все функции чистые и детерминированные (шум DP — на seedable ГПСЧ), чтобы
 * приватные агрегаты были воспроизводимы в тестах.
 */
import type { HealthProfile } from './health-profile.js';

/** Детерминированный ГПСЧ (mulberry32) — для воспроизводимого DP-шума. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Шум Лапласа с масштабом b = sensitivity/epsilon. */
export function laplaceNoise(epsilon: number, sensitivity = 1, seed = 1): number {
  const rng = mulberry32(seed);
  const u = rng() - 0.5;
  const b = sensitivity / Math.max(1e-6, epsilon);
  return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/** Применяет ε-дифференциальную приватность к числовому агрегату. */
export function privatize(value: number, epsilon = 1, sensitivity = 1, seed = 1): number {
  const noisy = value + laplaceNoise(epsilon, sensitivity, seed);
  return Math.round(noisy * 100) / 100;
}

/** Генерализация возраста в 5-летние страты — снижает реидентификацию. */
export function generalizeAge(age: number): string {
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 4}`;
}

export interface AnonymizedProfile {
  ageBand: string;
  sex: HealthProfile['sex'];
  ancestry?: HealthProfile['ancestry'];
  /** Сохранены только агрегированные клинические сигналы, без сырых идентификаторов. */
  hasGenomic: boolean;
  modalities: number;
}

/**
 * Возвращает деидентифицированное представление профиля для аналитики/обучения:
 * прямые и квазиидентификаторы удалены/генерализованы.
 */
export function anonymizeProfile(p: HealthProfile): AnonymizedProfile {
  return {
    ageBand: generalizeAge(p.ageYears),
    sex: p.sex,
    ancestry: p.ancestry,
    hasGenomic: Boolean(p.genomic),
    modalities: countModalities(p),
  };
}

function countModalities(p: HealthProfile): number {
  const keys: Array<keyof HealthProfile> = [
    'genomic', 'epigenetic', 'proteomic', 'metabolomic', 'microbiome',
    'labs', 'imaging', 'lifestyle', 'wearables', 'family', 'social', 'environmental',
  ];
  return keys.filter((k) => p[k] && Object.keys(p[k] as object).length > 0).length;
}

/**
 * Оценивает, удовлетворяет ли набор квазиидентификаторов порогу k-анонимности
 * по таблице частот страт (stratum → count).
 */
export function meetsKAnonymity(
  stratumKey: string,
  cohort: Map<string, number>,
  k = 5,
): boolean {
  return (cohort.get(stratumKey) ?? 0) >= k;
}

/** Геномные данные требуют усиленной защиты — явный флаг для политики доступа. */
export function requiresGeneticConsent(p: HealthProfile): boolean {
  return Boolean(p.genomic && (p.genomic.monogenic?.length || p.genomic.prs));
}
