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

  const inflammation = clamp(
    pressure(prot.crp, 1, 0.25) + pressure(prot.il6, 2, 0.12) + (micro.dysbiosisIndex ?? 0) / 60,
    -0.5,
    3,
  );

  const signals: ModalitySignals = {
    age: clamp((p.ageYears - 30) / 22, -1, 3),
    bioAgeAccel,
    bloodPressure: pressure(labs.systolicBp, 120, 0.03),
    lipids: clamp(pressure(labs.ldl, 2.6, 0.5) + pressure(meta.triglycerides, 1.5, 0.25) - protLow(labs.hdl, 1.4, 0.5), -1, 3),
    glycemia: clamp(pressure(labs.hba1c, 5.4, 0.7) + pressure(meta.glucoseFasting, 5.5, 0.4) + pressure(meta.homaIr, 2, 0.2), -1, 3),
    adiposity: pressure(labs.bmi, 23, 0.12),
    renal: labs.egfr !== undefined ? clamp((95 - labs.egfr) * 0.03, -0.3, 3) : 0,
    hepatic: clamp(pressure(labs.alt, 30, 0.03) + protective(p.imaging?.hepaticSteatosis, -0.8), -0.3, 3),
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
    autonomic: clamp(pressure(wear.restingHr, 60, 0.03) + (wear.hrv !== undefined ? (50 - wear.hrv) * 0.015 : 0), -0.5, 2),
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
