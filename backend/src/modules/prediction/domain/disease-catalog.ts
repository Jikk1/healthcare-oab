/**
 * ============================================================
 * OmniRisk — Disease catalogue (раздел плана «МОДЕЛИРУЕМЫЕ ЗАБОЛЕВАНИЯ»)
 * ============================================================
 *
 * Репрезентативная выборка из каталога ICD-11, покрывающая все 17 категорий
 * плюс предболезненные/субклинические состояния. Каждая запись несёт:
 *  - базовую пожизненную заболеваемость в популяции (lifetimeBaseline, %);
 *  - типичный возраст дебюта (baselineOnsetAge);
 *  - половой модификатор (sexFactor);
 *  - чувствительности к нормированным сигналам модальностей (weights):
 *    линейные коэффициенты при сигналах {@link ModalitySignals}.
 *
 * Каталог намеренно расширяем: чтобы добавить болезнь, достаточно дописать
 * запись — движок подхватит её без изменений кода. Коэффициенты иллюстративные
 * и подлежат калибровке на реальных когортах (см. model-registry.ts).
 */
import type { DiseaseCategory } from './health-profile.js';
import type { ModalitySignals } from './feature-space.js';

export type SignalKey = keyof ModalitySignals;
export type Stage = 'subclinical' | 'overt';

export interface DiseaseDef {
  /** Код в стиле ICD-11 (иллюстративный). */
  icd11: string;
  id: string;
  name: string;
  category: DiseaseCategory;
  /** Пожизненная базовая вероятность в среднем по популяции, %. */
  lifetimeBaseline: number;
  /** Типичный возраст дебюта при средней нагрузке. */
  baselineOnsetAge: number;
  /** Множитель для мужчин (для женщин — обратный); 1.0 = нейтрально. */
  sexFactor: number;
  /** Линейные веса при нормированных сигналах модальностей. */
  weights: Partial<Record<SignalKey, number>>;
  /** Стадии: субклиническая выявляется раньше, явная — позже. */
  stage?: Stage;
  /** Минимальный возраст, ниже которого риск практически нулевой. */
  minAge?: number;
}

/**
 * Базовый каталог. ~30 нозологий + предболезненные состояния — достаточно,
 * чтобы продемонстрировать каждую категорию и субклинические формы.
 */
export const DISEASES: DiseaseDef[] = [
  // ---------------- Сердечно-сосудистые ----------------
  {
    icd11: 'BA40', id: 'ihd', name: 'Ишемическая болезнь сердца', category: 'CARDIOVASCULAR',
    lifetimeBaseline: 32, baselineOnsetAge: 64, sexFactor: 1.4, minAge: 30,
    weights: { age: 4.2, bloodPressure: 2.4, lipids: 2.8, smoking: 2.6, glycemia: 1.4, inflammation: 1.2, genomicLoad: 1.6, inactivity: 0.9, adiposity: 0.7, autonomic: 0.6 },
  },
  {
    icd11: '8B20', id: 'stroke', name: 'Инсульт', category: 'CARDIOVASCULAR',
    lifetimeBaseline: 18, baselineOnsetAge: 70, sexFactor: 1.1, minAge: 35,
    weights: { age: 4.0, bloodPressure: 3.2, smoking: 1.6, glycemia: 1.2, lipids: 1.0, genomicLoad: 1.2, inflammation: 0.8 },
  },
  {
    icd11: 'BD10', id: 'hf', name: 'Хроническая сердечная недостаточность', category: 'CARDIOVASCULAR',
    lifetimeBaseline: 20, baselineOnsetAge: 72, sexFactor: 1.1, minAge: 40,
    weights: { age: 3.6, bloodPressure: 2.0, glycemia: 1.4, adiposity: 1.0, inflammation: 1.0, autonomic: 1.2 },
  },
  {
    icd11: 'BA00.Z', id: 'htn', name: 'Артериальная гипертензия (субклин.)', category: 'CARDIOVASCULAR',
    lifetimeBaseline: 55, baselineOnsetAge: 52, sexFactor: 1.05, stage: 'subclinical', minAge: 25,
    weights: { age: 3.0, bloodPressure: 4.0, adiposity: 1.6, alcohol: 1.0, stress: 0.8, social: 0.5 },
  },

  // ---------------- Онкологические ----------------
  {
    icd11: '2C25', id: 'lung_ca', name: 'Рак лёгкого', category: 'ONCOLOGY',
    lifetimeBaseline: 6, baselineOnsetAge: 68, sexFactor: 1.3, minAge: 40,
    weights: { age: 3.4, smoking: 4.6, environment: 1.6, genomicLoad: 1.2, inflammation: 0.8 },
  },
  {
    icd11: '2C61', id: 'breast_ca', name: 'Рак молочной железы', category: 'ONCOLOGY',
    lifetimeBaseline: 12, baselineOnsetAge: 62, sexFactor: 0.1, minAge: 30,
    weights: { age: 3.0, genomicLoad: 2.8, adiposity: 1.0, alcohol: 1.0 },
  },
  {
    icd11: '2C10', id: 'colorectal_ca', name: 'Колоректальный рак', category: 'ONCOLOGY',
    lifetimeBaseline: 5, baselineOnsetAge: 67, sexFactor: 1.2, minAge: 40,
    weights: { age: 3.2, adiposity: 1.4, diet: 1.6, inactivity: 1.0, alcohol: 1.0, microbiome: 1.2, genomicLoad: 1.4 },
  },
  {
    icd11: '2C82', id: 'prostate_ca', name: 'Рак предстательной железы', category: 'ONCOLOGY',
    lifetimeBaseline: 11, baselineOnsetAge: 70, sexFactor: 2.0, minAge: 45,
    weights: { age: 3.6, genomicLoad: 2.4, diet: 0.8 },
  },

  // ---------------- Эндокринные ----------------
  {
    icd11: '5A11', id: 't2dm', name: 'Сахарный диабет 2 типа', category: 'ENDOCRINE',
    lifetimeBaseline: 28, baselineOnsetAge: 58, sexFactor: 1.05, minAge: 25,
    weights: { glycemia: 4.4, adiposity: 3.0, inactivity: 1.4, diet: 1.2, age: 1.6, genomicLoad: 1.4, inflammation: 0.8 },
  },
  {
    icd11: '5A11.Z', id: 'prediabetes', name: 'Предиабет (субклин.)', category: 'ENDOCRINE',
    lifetimeBaseline: 38, baselineOnsetAge: 48, sexFactor: 1.0, stage: 'subclinical', minAge: 20,
    weights: { glycemia: 4.8, adiposity: 2.6, inactivity: 1.4, diet: 1.2, age: 1.0 },
  },
  {
    icd11: '5A00', id: 'hypothyroid', name: 'Гипотиреоз', category: 'ENDOCRINE',
    lifetimeBaseline: 10, baselineOnsetAge: 50, sexFactor: 0.3, minAge: 20,
    weights: { age: 1.6, immune: 1.4, genomicLoad: 1.2 },
  },
  {
    icd11: 'FB83.0', id: 'osteoporosis', name: 'Остеопороз', category: 'MUSCULOSKELETAL',
    lifetimeBaseline: 15, baselineOnsetAge: 66, sexFactor: 0.4, minAge: 45,
    weights: { age: 3.2, inactivity: 1.2, smoking: 1.0, diet: 0.8, alcohol: 0.6 },
  },

  // ---------------- Аутоиммунные ----------------
  {
    icd11: 'FA20', id: 'ra', name: 'Ревматоидный артрит', category: 'AUTOIMMUNE',
    lifetimeBaseline: 3, baselineOnsetAge: 50, sexFactor: 0.4, minAge: 20,
    weights: { immune: 2.4, inflammation: 2.0, genomicLoad: 2.0, smoking: 1.4, microbiome: 1.0 },
  },
  {
    icd11: '4A40', id: 'sle', name: 'Системная красная волчанка', category: 'AUTOIMMUNE',
    lifetimeBaseline: 1, baselineOnsetAge: 35, sexFactor: 0.15, minAge: 15,
    weights: { immune: 2.6, inflammation: 2.0, genomicLoad: 2.4, environment: 1.0 },
  },

  // ---------------- Инфекционные ----------------
  {
    icd11: 'CA40', id: 'severe_resp_infection', name: 'Тяжёлая респираторная инфекция', category: 'INFECTIOUS',
    lifetimeBaseline: 14, baselineOnsetAge: 60, sexFactor: 1.1, minAge: 0,
    weights: { age: 3.0, immune: 2.0, smoking: 1.4, environment: 1.0, glycemia: 0.8, inflammation: 0.8 },
  },

  // ---------------- Неврологические ----------------
  {
    icd11: '8A20', id: 'alzheimer', name: 'Болезнь Альцгеймера', category: 'NEUROLOGICAL',
    lifetimeBaseline: 11, baselineOnsetAge: 76, sexFactor: 0.8, minAge: 50,
    weights: { age: 4.6, genomicLoad: 2.6, bloodPressure: 1.2, glycemia: 1.2, inactivity: 1.0, social: 1.0, inflammation: 1.0 },
  },
  {
    icd11: '8A00', id: 'parkinson', name: 'Болезнь Паркинсона', category: 'NEUROLOGICAL',
    lifetimeBaseline: 3, baselineOnsetAge: 72, sexFactor: 1.5, minAge: 45,
    weights: { age: 4.0, genomicLoad: 2.0, environment: 1.6, microbiome: 1.0 },
  },

  // ---------------- Психические ----------------
  {
    icd11: '6A70', id: 'depression', name: 'Депрессивное расстройство', category: 'PSYCHIATRIC',
    lifetimeBaseline: 20, baselineOnsetAge: 38, sexFactor: 0.6, minAge: 12,
    weights: { stress: 2.6, social: 2.0, sleep: 1.6, genomicLoad: 1.4, inflammation: 1.0, inactivity: 0.8 },
  },

  // ---------------- Дыхательные ----------------
  {
    icd11: 'CA22', id: 'copd', name: 'ХОБЛ', category: 'RESPIRATORY',
    lifetimeBaseline: 10, baselineOnsetAge: 66, sexFactor: 1.2, minAge: 40,
    weights: { smoking: 4.4, age: 2.6, environment: 1.8, inflammation: 1.0 },
  },
  {
    icd11: 'CA23', id: 'asthma', name: 'Бронхиальная астма', category: 'RESPIRATORY',
    lifetimeBaseline: 8, baselineOnsetAge: 30, sexFactor: 0.9, minAge: 0,
    weights: { immune: 1.8, environment: 2.0, genomicLoad: 1.4, inflammation: 1.2 },
  },

  // ---------------- ЖКТ / Печень ----------------
  {
    icd11: 'DA42', id: 'pud', name: 'Язвенная болезнь', category: 'GASTROINTESTINAL',
    lifetimeBaseline: 8, baselineOnsetAge: 48, sexFactor: 1.2, minAge: 18,
    weights: { smoking: 1.6, alcohol: 1.6, stress: 1.2, microbiome: 1.4, inflammation: 0.8 },
  },
  {
    icd11: 'DB92', id: 'nafld', name: 'Неалкогольная жировая болезнь печени', category: 'HEPATIC',
    lifetimeBaseline: 25, baselineOnsetAge: 52, sexFactor: 1.1, minAge: 20,
    weights: { adiposity: 3.2, glycemia: 2.4, hepatic: 2.0, lipids: 1.4, inactivity: 1.0, alcohol: 0.8 },
  },
  {
    icd11: 'DB99', id: 'cirrhosis', name: 'Цирроз печени', category: 'HEPATIC',
    lifetimeBaseline: 4, baselineOnsetAge: 60, sexFactor: 1.4, minAge: 30,
    weights: { alcohol: 3.6, hepatic: 2.8, adiposity: 1.2, glycemia: 1.0, inflammation: 1.0 },
  },

  // ---------------- Почки ----------------
  {
    icd11: 'GB61', id: 'ckd', name: 'Хроническая болезнь почек', category: 'RENAL',
    lifetimeBaseline: 14, baselineOnsetAge: 64, sexFactor: 1.0, minAge: 30,
    weights: { renal: 4.2, bloodPressure: 2.0, glycemia: 2.2, age: 1.8, inflammation: 0.8 },
  },

  // ---------------- Офтальмология ----------------
  {
    icd11: '9B10', id: 'amd', name: 'Возрастная макулодистрофия', category: 'OPHTHALMIC',
    lifetimeBaseline: 9, baselineOnsetAge: 72, sexFactor: 0.9, minAge: 50,
    weights: { age: 3.8, smoking: 2.0, genomicLoad: 1.8, lipids: 0.8 },
  },

  // ---------------- Кожа ----------------
  {
    icd11: '2C30', id: 'melanoma', name: 'Меланома кожи', category: 'DERMATOLOGIC',
    lifetimeBaseline: 2, baselineOnsetAge: 58, sexFactor: 1.1, minAge: 20,
    weights: { environment: 2.4, genomicLoad: 2.0, age: 1.6, immune: 0.8 },
  },

  // ---------------- Кровь ----------------
  {
    icd11: '3A00', id: 'anemia', name: 'Хроническая анемия', category: 'HEMATOLOGIC',
    lifetimeBaseline: 12, baselineOnsetAge: 55, sexFactor: 0.7, minAge: 12,
    weights: { immune: 1.2, renal: 1.4, diet: 1.2, inflammation: 1.0, age: 1.0 },
  },

  // ---------------- Редкие / орфанные ----------------
  {
    icd11: '5C50.0', id: 'fh', name: 'Семейная гиперхолестеринемия', category: 'RARE',
    lifetimeBaseline: 0.4, baselineOnsetAge: 40, sexFactor: 1.0, minAge: 5,
    weights: { genomicLoad: 4.0, lipids: 3.0 },
  },
];

/** Быстрый доступ к болезни по id. */
export const DISEASE_BY_ID = new Map(DISEASES.map((d) => [d.id, d]));
