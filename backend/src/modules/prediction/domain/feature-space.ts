/**
 * ============================================================
 * OmniRisk — Feature space normalisation
 * ============================================================
 *
 * Превращает разнородный {@link HealthProfile} в единый вектор нормированных
 * сигналов. Каждый сигнал — это «давление риска» в диапазоне примерно [-1..+3],
 * где 0 ≈ оптимум, положительные значения — неблагоприятно, отрицательные —
 * протективно. Это вход для всех шести слоёв архитектуры.
 *
 * Также считается `completeness` по модальностям — мера полноты данных,
 * напрямую влияющая на ширину доверительных интервалов в слое выживаемости.
 */
import type { DiseaseCategory, HealthProfile } from './health-profile.js';

export type ModalitySignals = {
  // Демография / старение
  age: number; // нормированный возраст-фактор
  bioAgeAccel: number; // ускорение биологического возраста (годы)
  // Метаболизм / сосуды
  bloodPressure: number;
  lipids: number;
  glycemia: number;
  adiposity: number;
  renal: number;
  hepatic: number;
  // Гематология / кардиомаркеры
  hematologic: number; // анемия/цитопении/цитозы по ОАК
  cardiac: number; // повреждение миокарда (тропонин/NT-proBNP)
  // Воспаление / иммунитет
  inflammation: number;
  immune: number;
  // Геном
  genomicLoad: number; // суммарная полигенная нагрузка
  // Микробиом
  microbiome: number;
  // Поведение
  smoking: number;
  alcohol: number;
  inactivity: number;
  diet: number;
  sleep: number;
  stress: number;
  // Среда
  environment: number;
  social: number;
  // Кардио-сигналы носимых
  autonomic: number; // ВСР/пульс покоя
};

export interface NormalizedProfile {
  ageYears: number;
  sex: HealthProfile['sex'];
  signals: ModalitySignals;
  /** Полигенный риск-скор на категорию (z-оценка), прокинутый как есть. */
  prs: Partial<Record<DiseaseCategory, number>>;
  monogenic: string[];
  family: Partial<Record<DiseaseCategory, number>>;
  /** Полнота данных по модальностям, 0..1. */
  completeness: number;
  /** Список фактически предоставленных модальностей (для XAI и аудита). */
  modalitiesPresent: string[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Линейная нормировка отклонения от оптимума с насыщением. */
function pressure(value: number | undefined, optimal: number, perUnit: number, cap = 3): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return clamp((value - optimal) * perUnit, -1, cap);
}

function protective(present: boolean | undefined, magnitude: number): number {
  return present ? -magnitude : 0;
}

export function normalizeProfile(p: HealthProfile): NormalizedProfile {
  const labs = p.labs ?? {};
  const life = p.lifestyle ?? {};
  const wear = p.wearables ?? {};
  const epi = p.epigenetic ?? {};
  const prot = p.proteomic ?? {};
  const meta = p.metabolomic ?? {};
  const micro = p.microbiome ?? {};
  const env = p.environmental ?? {};
  const soc = p.social ?? {};

  const present: string[] = [];
  const mark = (obj: object | undefined, name: string): void => {
    if (obj && Object.keys(obj).length > 0) present.push(name);
  };
  mark(p.genomic, 'genomic');
  mark(p.epigenetic, 'epigenetic');
  mark(p.proteomic, 'proteomic');
  mark(p.metabolomic, 'metabolomic');
  mark(p.microbiome, 'microbiome');
  mark(p.labs, 'labs');
  mark(p.imaging, 'imaging');
  mark(p.lifestyle, 'lifestyle');
  mark(p.wearables, 'wearables');
  mark(p.family, 'family');
  mark(p.social, 'social');
  mark(p.environmental, 'environmental');

  // Биологический возраст: эпигенетические часы + косвенные маркеры старения.
  const telomerePenalty = epi.telomerePercentile !== undefined ? (50 - epi.telomerePercentile) / 12 : 0;
  const bioAgeAccel =
    (epi.methylationAgeAccel ?? 0) +
    telomerePenalty +
    (epi.agingRate !== undefined ? (epi.agingRate - 1) * 6 : 0);

  // Геномная нагрузка: средний PRS по категориям + штраф за моногенные находки.
  const prs = p.genomic?.prs ?? {};
  const prsValues = Object.values(prs).filter((v): v is number => typeof v === 'number');
  const prsMean = prsValues.length ? prsValues.reduce((a, b) => a + b, 0) / prsValues.length : 0;
  const genomicLoad = clamp(prsMean * 0.6 + (p.genomic?.monogenic?.length ?? 0) * 0.8, -1, 3);

  // Воспаление: вч-СРБ + ИЛ-6 + дисбиоз + нейтрофил-лимфоцитарное отношение (NLR) + СОЭ.
  const nlr =
    labs.neutrophils !== undefined && labs.lymphocytes !== undefined && labs.lymphocytes > 0
      ? labs.neutrophils / labs.lymphocytes
      : undefined;
  const inflammation = clamp(
    pressure(prot.crp, 1, 0.25) +
      pressure(prot.il6, 2, 0.12) +
      (micro.dysbiosisIndex ?? 0) / 60 +
      (nlr !== undefined ? clamp((nlr - 2) * 0.18, -0.2, 1.5) : 0) +
      pressure(labs.esr, 8, 0.03),
    -0.5,
    3,
  );

  // Гематология: анемия (низкий Hb/Hct, с учётом пола) + аномалии тромбоцитов.
  const hbOptimal = p.sex === 'FEMALE' ? 135 : p.sex === 'MALE' ? 150 : 140; // г/л, середина нормы
  const hctOptimal = p.sex === 'FEMALE' ? 41 : p.sex === 'MALE' ? 45 : 43; // %, середина нормы
  const anemiaPressure =
    (labs.hemoglobin !== undefined ? clamp((hbOptimal - labs.hemoglobin) * 0.045, -0.4, 3) : 0) +
    (labs.hematocrit !== undefined ? clamp((hctOptimal - labs.hematocrit) * 0.05, -0.3, 2) : 0);
  // Тромбоциты: отклонение от нормы 150–400 (центр 275, полуширина 125) в обе стороны вредно.
  const plateletPressure =
    labs.platelets !== undefined ? clamp((Math.abs(labs.platelets - 275) - 125) * 0.006, 0, 1.5) : 0;
  const hematologic = clamp(anemiaPressure + plateletPressure * 0.5, -0.5, 3);

  // Кардиомаркеры повреждения миокарда: вч-тропонин (норма <14 нг/л), NT-proBNP (<125 пг/мл).
  const cardiac = clamp(
    (prot.troponin !== undefined ? clamp((prot.troponin - 14) * 0.03, 0, 2) : 0) +
      (prot.ntProBnp !== undefined ? clamp((prot.ntProBnp - 125) * 0.0025, 0, 2) : 0),
    0,
    3,
  );

  // Артериальное давление: систолическое + диастолическое (усредняем при наличии обоих).
  const sbpPressure = labs.systolicBp !== undefined ? pressure(labs.systolicBp, 120, 0.03) : undefined;
  const dbpPressure = labs.diastolicBp !== undefined ? pressure(labs.diastolicBp, 80, 0.045) : undefined;
  const bloodPressure =
    sbpPressure !== undefined && dbpPressure !== undefined
      ? clamp((sbpPressure + dbpPressure) / 2, -1, 3)
      : (sbpPressure ?? dbpPressure ?? 0);

  const signals: ModalitySignals = {
    age: clamp((p.ageYears - 30) / 22, -1, 3),
    bioAgeAccel,
    bloodPressure,
    lipids: clamp(
      pressure(labs.ldl, 2.6, 0.5) +
        pressure(labs.totalChol, 5.0, 0.2) +
        pressure(meta.triglycerides, 1.5, 0.25) -
        protLow(labs.hdl, 1.4, 0.5),
      -1,
      3,
    ),
    glycemia: clamp(pressure(labs.hba1c, 5.4, 0.7) + pressure(meta.glucoseFasting, 5.5, 0.4) + pressure(meta.homaIr, 2, 0.2), -1, 3),
    adiposity: pressure(labs.bmi, 23, 0.12),
    renal: clamp(
      (labs.egfr !== undefined ? (95 - labs.egfr) * 0.03 : 0) +
        (meta.uricAcid !== undefined ? clamp((meta.uricAcid - 360) * 0.002, -0.2, 1) : 0),
      -0.3,
      3,
    ),
    hepatic: clamp(pressure(labs.alt, 30, 0.03) + protective(p.imaging?.hepaticSteatosis, -0.8), -0.3, 3),
    hematologic,
    cardiac,
    inflammation,
    immune: clamp(pressure(labs.wbc, 6, 0.08), -0.5, 2),
    genomicLoad,
    microbiome: micro.diversityShannon !== undefined ? clamp((3.5 - micro.diversityShannon) * 0.4, -0.5, 2) : (micro.dysbiosisIndex ?? 0) / 60,
    smoking:
      life.smokingStatus === 'CURRENT'
        ? clamp(1.6 + (life.packYears ?? 0) * 0.02, 0, 3)
        : life.smokingStatus === 'FORMER'
          ? 0.5
          : 0,
    alcohol: pressure(life.alcoholUnitsPerWeek, 4, 0.06),
    inactivity: clamp(0.8 - (life.activityPerWeek ?? 0) * 0.3, -1, 1.5),
    diet: life.dietQuality !== undefined ? clamp((60 - life.dietQuality) / 40, -1, 1.5) : 0,
    sleep: life.sleepHours !== undefined ? clamp(Math.abs(life.sleepHours - 7.5) * 0.25, 0, 1.5) : 0,
    stress: clamp(((life.stressLevel ?? 3) - 3) * 0.18, -0.5, 1.5),
    environment: clamp(pressure(env.airPm25, 5, 0.04) + (env.occupationalHazard ?? 0) * 0.06, -0.2, 2),
    social: clamp(
      (soc.incomeBracket !== undefined ? (3 - soc.incomeBracket) * 0.18 : 0) +
        (soc.isolated ? 0.5 : 0) +
        (soc.educationYears !== undefined ? (12 - soc.educationYears) * 0.04 : 0),
      -0.6,
      1.5,
    ),
    autonomic: clamp(
      pressure(wear.restingHr, 60, 0.03) +
        (wear.hrv !== undefined ? (50 - wear.hrv) * 0.015 : 0) +
        (wear.spo2 !== undefined ? clamp((96 - wear.spo2) * 0.1, -0.2, 1.5) : 0) +
        (wear.vo2max !== undefined ? clamp((35 - wear.vo2max) * 0.02, -0.6, 1) : 0),
      -0.5,
      2,
    ),
  };

  // Полнота: доля заполненных модальностей из 12 ключевых.
  const completeness = clamp(present.length / 12, 0.1, 1);

  return {
    ageYears: p.ageYears,
    sex: p.sex,
    signals,
    prs,
    monogenic: p.genomic?.monogenic ?? [],
    family: p.family?.affected ?? {},
    completeness,
    modalitiesPresent: present,
  };
}

/** Протективный фактор «чем выше — тем лучше» (например, HDL). */
function protLow(value: number | undefined, optimal: number, perUnit: number): number {
  if (value === undefined) return 0;
  return clamp((value - optimal) * perUnit, -1.5, 1);
}
