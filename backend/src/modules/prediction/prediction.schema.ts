import { z } from 'zod';

/**
 * Валидация мультимодального профиля для эндпоинтов прогнозирования.
 * Зеркалит доменный тип HealthProfile, но с жёсткими границами значений —
 * вход не доверяется (defense in depth поверх доменной логики).
 */

const SexEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);
const SmokingEnum = z.enum(['NEVER', 'FORMER', 'CURRENT']);
const AncestryEnum = z.enum(['EUR', 'EAS', 'SAS', 'AFR', 'AMR', 'MIXED']);

const DiseaseCategoryEnum = z.enum([
  'CARDIOVASCULAR', 'ONCOLOGY', 'ENDOCRINE', 'AUTOIMMUNE', 'INFECTIOUS',
  'NEUROLOGICAL', 'PSYCHIATRIC', 'GENETIC', 'MUSCULOSKELETAL', 'RESPIRATORY',
  'GASTROINTESTINAL', 'HEPATIC', 'RENAL', 'OPHTHALMIC', 'DERMATOLOGIC',
  'HEMATOLOGIC', 'RARE',
]);

const categoryRecord = (value: z.ZodTypeAny) => z.record(DiseaseCategoryEnum, value);

const LabSchema = z.object({
  systolicBp: z.number().min(60).max(260).optional(),
  diastolicBp: z.number().min(30).max(160).optional(),
  ldl: z.number().min(0).max(15).optional(),
  hdl: z.number().min(0).max(5).optional(),
  totalChol: z.number().min(0).max(20).optional(),
  hba1c: z.number().min(2).max(20).optional(),
  bmi: z.number().min(10).max(80).optional(),
  egfr: z.number().min(1).max(200).optional(),
  alt: z.number().min(0).max(2000).optional(),
  hemoglobin: z.number().min(20).max(250).optional(),
  wbc: z.number().min(0).max(100).optional(),
}).strict();

const WearableSchema = z.object({
  restingHr: z.number().min(30).max(160).optional(),
  hrv: z.number().min(1).max(300).optional(),
  spo2: z.number().min(50).max(100).optional(),
  stepsPerDay: z.number().min(0).max(80000).optional(),
  vo2max: z.number().min(5).max(90).optional(),
}).strict();

export const HealthProfileSchema = z.object({
  ageYears: z.number().int().min(0).max(120),
  sex: SexEnum,
  ancestry: AncestryEnum.optional(),

  genomic: z.object({
    prs: categoryRecord(z.number().min(-6).max(6)).optional(),
    monogenic: z.array(z.string().max(40)).max(50).optional(),
    coverage: z.number().min(0).max(1).optional(),
  }).strict().optional(),

  epigenetic: z.object({
    methylationAgeAccel: z.number().min(-30).max(40).optional(),
    telomerePercentile: z.number().min(0).max(100).optional(),
    agingRate: z.number().min(0).max(4).optional(),
  }).strict().optional(),

  proteomic: z.object({
    crp: z.number().min(0).max(400).optional(),
    il6: z.number().min(0).max(1000).optional(),
    troponin: z.number().min(0).max(100000).optional(),
    ntProBnp: z.number().min(0).max(100000).optional(),
  }).strict().optional(),

  metabolomic: z.object({
    glucoseFasting: z.number().min(1).max(40).optional(),
    triglycerides: z.number().min(0).max(30).optional(),
    uricAcid: z.number().min(0).max(1500).optional(),
    homaIr: z.number().min(0).max(50).optional(),
  }).strict().optional(),

  microbiome: z.object({
    diversityShannon: z.number().min(0).max(10).optional(),
    dysbiosisIndex: z.number().min(0).max(100).optional(),
  }).strict().optional(),

  labs: LabSchema.optional(),

  imaging: z.object({
    coronaryCalciumScore: z.number().min(0).max(5000).optional(),
    carotidPlaque: z.boolean().optional(),
    hepaticSteatosis: z.boolean().optional(),
    boneDensityTscore: z.number().min(-6).max(4).optional(),
    ejectionFraction: z.number().min(5).max(85).optional(),
  }).strict().optional(),

  lifestyle: z.object({
    smokingStatus: SmokingEnum.optional(),
    packYears: z.number().min(0).max(150).optional(),
    alcoholUnitsPerWeek: z.number().min(0).max(200).optional(),
    activityPerWeek: z.number().min(0).max(21).optional(),
    dietQuality: z.number().min(0).max(100).optional(),
    sleepHours: z.number().min(0).max(16).optional(),
    stressLevel: z.number().min(0).max(10).optional(),
  }).strict().optional(),

  wearables: WearableSchema.optional(),

  family: z.object({
    affected: categoryRecord(z.number().int().min(0).max(10)).optional(),
    earliestOnsetAge: categoryRecord(z.number().min(0).max(120)).optional(),
  }).strict().optional(),

  social: z.object({
    educationYears: z.number().min(0).max(30).optional(),
    incomeBracket: z.number().int().min(1).max(5).optional(),
    isolated: z.boolean().optional(),
  }).strict().optional(),

  environmental: z.object({
    airPm25: z.number().min(0).max(500).optional(),
    radiationMsvPerYear: z.number().min(0).max(100).optional(),
    occupationalHazard: z.number().min(0).max(10).optional(),
    waterQuality: z.number().min(0).max(100).optional(),
  }).strict().optional(),

  history: z.array(z.object({
    ageYears: z.number().min(0).max(120),
    labs: LabSchema.optional(),
    wearables: WearableSchema.optional(),
  })).max(60).optional(),
}).strict();

export type HealthProfileInput = z.infer<typeof HealthProfileSchema>;

/** Тело контрфактического вмешательства: частичный профиль-оверрайд. */
export const InterventionSchema = z.object({
  overrides: HealthProfileSchema.partial(),
}).strict();
export type InterventionInput = z.infer<typeof InterventionSchema>;
