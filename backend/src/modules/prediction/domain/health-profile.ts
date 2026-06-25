/**
 * ============================================================
 * OmniRisk — Multimodal Health Profile (раздел плана «ВХОДНЫЕ ДАННЫЕ»)
 * ============================================================
 *
 * Единая типизированная модель «всего, что мы знаем о человеке»: геном,
 * эпигенетика, транскриптомика, протеомика, метаболомика, микробиом,
 * лабораторные данные, инструментальная диагностика, ЭМК, семейный анамнез,
 * образ жизни, носимые устройства, социальные и экологические факторы.
 *
 * Все поля опциональны: движок штатно работает с любым уровнем полноты данных
 * (отсутствие модальности расширяет доверительный интервал, а не ломает расчёт).
 * Значения задаются в клинических единицах либо как нормированные перцентили
 * (0..100) / z-оценки — это указано рядом с каждым полем.
 */

export type Sex = 'MALE' | 'FEMALE' | 'OTHER';
export type SmokingStatus = 'NEVER' | 'FORMER' | 'CURRENT';
export type Ancestry =
  | 'EUR' // европейская
  | 'EAS' // восточноазиатская
  | 'SAS' // южноазиатская
  | 'AFR' // африканская
  | 'AMR' // американская
  | 'MIXED';

/** Геномика: полигенные риск-скоры и моногенные находки. */
export interface GenomicData {
  /** Полигенные риск-скоры по категориям болезней, z-оценка относительно популяции. */
  prs?: Partial<Record<DiseaseCategory, number>>;
  /** Патогенные моногенные варианты (например, 'BRCA1', 'LDLR', 'APOE4x2'). */
  monogenic?: string[];
  /** Доля генома, покрытая секвенированием (0..1) — влияет на уверенность. */
  coverage?: number;
}

/** Эпигенетика: биологический возраст и скорость старения. */
export interface EpigeneticData {
  /** Ускорение эпигенетических часов (годы): +N означает «старше паспортного». */
  methylationAgeAccel?: number;
  /** Перцентиль длины теломер (0..100): ниже — хуже. */
  telomerePercentile?: number;
  /** Композитная скорость старения (1.0 = норма, >1 — ускоренное). */
  agingRate?: number;
}

/** Протеомика: воспаление и сигнальные белки. */
export interface ProteomicData {
  crp?: number; // вч-СРБ, мг/л
  il6?: number; // интерлейкин-6, пг/мл
  troponin?: number; // вч-тропонин, нг/л
  ntProBnp?: number; // NT-proBNP, пг/мл
}

/** Метаболомика: липиды, гликемия, обмен. */
export interface MetabolomicData {
  glucoseFasting?: number; // ммоль/л
  triglycerides?: number; // ммоль/л
  uricAcid?: number; // мкмоль/л
  homaIr?: number; // индекс инсулинорезистентности
}

/** Микробиом: разнообразие и дисбиоз. */
export interface MicrobiomeData {
  diversityShannon?: number; // индекс Шеннона (выше — лучше, типично 2..5)
  dysbiosisIndex?: number; // 0..100, выше — хуже
}

/** Базовые лабораторные данные и витальные показатели. */
export interface LabData {
  systolicBp?: number; // мм рт.ст.
  diastolicBp?: number; // мм рт.ст.
  ldl?: number; // ммоль/л
  hdl?: number; // ммоль/л
  totalChol?: number; // ммоль/л
  hba1c?: number; // %
  bmi?: number; // кг/м²
  egfr?: number; // мл/мин/1.73м²
  alt?: number; // АЛТ, Ед/л
  hemoglobin?: number; // г/л
  wbc?: number; // лейкоциты, ×10⁹/л
}

/** Инструментальная диагностика (результаты, не сырые изображения). */
export interface ImagingData {
  coronaryCalciumScore?: number; // шкала Агатстона
  carotidPlaque?: boolean; // бляшки сонных артерий
  hepaticSteatosis?: boolean; // стеатоз печени по УЗИ
  boneDensityTscore?: number; // T-критерий денситометрии
  ejectionFraction?: number; // ФВ ЛЖ, %
}

/** Образ жизни. */
export interface LifestyleData {
  smokingStatus?: SmokingStatus;
  packYears?: number;
  alcoholUnitsPerWeek?: number;
  activityPerWeek?: number; // тренировок/нед
  dietQuality?: number; // 0..100 (выше — лучше, индекс типа AHEI)
  sleepHours?: number;
  stressLevel?: number; // 0..10
}

/** Данные носимых устройств. */
export interface WearableData {
  restingHr?: number; // уд/мин
  hrv?: number; // мс (SDNN)
  spo2?: number; // %
  stepsPerDay?: number;
  vo2max?: number; // мл/кг/мин
}

/** Семейный анамнез — число родственников 1-й линии с болезнью категории. */
export interface FamilyHistory {
  affected?: Partial<Record<DiseaseCategory, number>>;
  earliestOnsetAge?: Partial<Record<DiseaseCategory, number>>;
}

/** Социальные детерминанты здоровья. */
export interface SocialData {
  educationYears?: number;
  incomeBracket?: number; // 1 (низкий) .. 5 (высокий)
  isolated?: boolean; // социальная изоляция
}

/** Экологические факторы. */
export interface EnvironmentalData {
  airPm25?: number; // среднегодовой PM2.5, мкг/м³
  radiationMsvPerYear?: number;
  occupationalHazard?: number; // 0..10
  waterQuality?: number; // 0..100 (выше — лучше)
}

/**
 * Полный профиль пациента. Демографические поля обязательны — это минимум,
 * остальное наращивается по мере доступности данных.
 */
export interface HealthProfile {
  ageYears: number;
  sex: Sex;
  ancestry?: Ancestry;

  genomic?: GenomicData;
  epigenetic?: EpigeneticData;
  proteomic?: ProteomicData;
  metabolomic?: MetabolomicData;
  microbiome?: MicrobiomeData;
  labs?: LabData;
  imaging?: ImagingData;
  lifestyle?: LifestyleData;
  wearables?: WearableData;
  family?: FamilyHistory;
  social?: SocialData;
  environmental?: EnvironmentalData;

  /**
   * Лонгитюдные срезы прошлых лет для слоя временных рядов
   * (по возрастанию даты). Каждый срез — частичный набор лабораторных данных.
   */
  history?: Array<{ ageYears: number; labs?: LabData; wearables?: WearableData }>;
}

/** Категории болезней (укрупнённые группы каталога ICD-11). */
export type DiseaseCategory =
  | 'CARDIOVASCULAR'
  | 'ONCOLOGY'
  | 'ENDOCRINE'
  | 'AUTOIMMUNE'
  | 'INFECTIOUS'
  | 'NEUROLOGICAL'
  | 'PSYCHIATRIC'
  | 'GENETIC'
  | 'MUSCULOSKELETAL'
  | 'RESPIRATORY'
  | 'GASTROINTESTINAL'
  | 'HEPATIC'
  | 'RENAL'
  | 'OPHTHALMIC'
  | 'DERMATOLOGIC'
  | 'HEMATOLOGIC'
  | 'RARE';

export const DISEASE_CATEGORIES: DiseaseCategory[] = [
  'CARDIOVASCULAR',
  'ONCOLOGY',
  'ENDOCRINE',
  'AUTOIMMUNE',
  'INFECTIOUS',
  'NEUROLOGICAL',
  'PSYCHIATRIC',
  'GENETIC',
  'MUSCULOSKELETAL',
  'RESPIRATORY',
  'GASTROINTESTINAL',
  'HEPATIC',
  'RENAL',
  'OPHTHALMIC',
  'DERMATOLOGIC',
  'HEMATOLOGIC',
  'RARE',
];

export const CATEGORY_LABELS: Record<DiseaseCategory, string> = {
  CARDIOVASCULAR: 'Сердечно-сосудистые',
  ONCOLOGY: 'Онкологические',
  ENDOCRINE: 'Эндокринные',
  AUTOIMMUNE: 'Аутоиммунные',
  INFECTIOUS: 'Инфекционные',
  NEUROLOGICAL: 'Неврологические',
  PSYCHIATRIC: 'Психические',
  GENETIC: 'Генетические',
  MUSCULOSKELETAL: 'Опорно-двигательные',
  RESPIRATORY: 'Дыхательные',
  GASTROINTESTINAL: 'ЖКТ',
  HEPATIC: 'Печёночные',
  RENAL: 'Почечные',
  OPHTHALMIC: 'Офтальмологические',
  DERMATOLOGIC: 'Кожные',
  HEMATOLOGIC: 'Гематологические',
  RARE: 'Редкие/орфанные',
};
