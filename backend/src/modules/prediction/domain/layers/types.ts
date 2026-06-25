/**
 * Общие типы конвейера слоёв архитектуры (Слои №1–№6).
 * Каждый слой — чистая функция, принимающая результат предыдущего и
 * обогащающая его. Так шесть разнородных «моделей» из плана собираются в
 * единый детерминированный, тестируемый конвейер.
 */
import type { DiseaseDef, SignalKey } from '../disease-catalog.js';
import type { NormalizedProfile } from '../feature-space.js';

/** Вклад одного сигнала в линейный предиктор болезни (для XAI). */
export interface SignalContribution {
  signal: SignalKey | 'prs' | 'monogenic' | 'family' | 'graph' | 'sex';
  label: string;
  value: number; // вклад в линейный предиктор
  modifiable: boolean;
}

/** Линейный предиктор болезни после слоёв 1–3 (до выживаемости). */
export interface DiseaseLinearScore {
  disease: DiseaseDef;
  /** Суммарный линейный предиктор (log-hazard относительно базы). */
  lp: number;
  /** Покомпонентные вклады для объяснимости. */
  contributions: SignalContribution[];
  /** Множитель ускорения от слоя временных рядов (1.0 = нет тренда). */
  temporalAccel: number;
}

export interface LayerContext {
  profile: NormalizedProfile;
}

const NON_MODIFIABLE: ReadonlySet<string> = new Set(['age', 'genomicLoad', 'prs', 'monogenic', 'family', 'sex']);

export function isModifiable(signal: string): boolean {
  return !NON_MODIFIABLE.has(signal);
}

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  age: 'Возраст',
  bioAgeAccel: 'Биол. возраст (ускорение)',
  bloodPressure: 'Артериальное давление',
  lipids: 'Липидный профиль',
  glycemia: 'Гликемия',
  adiposity: 'Ожирение/ИМТ',
  renal: 'Почечная функция',
  hepatic: 'Печёночная функция',
  inflammation: 'Хроническое воспаление',
  immune: 'Иммунный статус',
  genomicLoad: 'Геномная нагрузка',
  microbiome: 'Микробиом',
  smoking: 'Курение',
  alcohol: 'Алкоголь',
  inactivity: 'Гиподинамия',
  diet: 'Качество питания',
  sleep: 'Сон',
  stress: 'Стресс',
  environment: 'Экология/среда',
  social: 'Социальные факторы',
  autonomic: 'Вегетативный тонус (ВСР)',
};
