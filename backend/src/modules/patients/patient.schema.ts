import { z } from 'zod';

export const SexEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);
export const RiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const SmokingEnum = z.enum(['NEVER', 'FORMER', 'CURRENT']);

export const CreatePatientBody = z.object({
  mrn: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,32}$/)
    .optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  sex: SexEnum,
  ageYears: z.number().int().min(0).max(120),
  birthDate: z.string().date().optional(),
});
export type CreatePatientBody = z.infer<typeof CreatePatientBody>;

export const UpdatePatientBody = CreatePatientBody.partial().omit({ mrn: true });
export type UpdatePatientBody = z.infer<typeof UpdatePatientBody>;

export const ListPatientsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  level: RiskLevelEnum.optional(),
  search: z.string().trim().max(120).optional(),
  archived: z.coerce.boolean().default(false),
});
export type ListPatientsQuery = z.infer<typeof ListPatientsQuery>;

// Biomarker snapshot — the clinical inputs to the risk engine.
export const BiomarkerBody = z.object({
  systolicBp: z.number().int().min(60).max(260).optional(),
  diastolicBp: z.number().int().min(30).max(160).optional(),
  ldl: z.number().min(0).max(15).optional(),
  hdl: z.number().min(0).max(5).optional(),
  totalChol: z.number().min(0).max(20).optional(),
  hba1c: z.number().min(2).max(20).optional(),
  bmi: z.number().min(10).max(80).optional(),
  egfr: z.number().min(1).max(200).optional(),
  smokingStatus: SmokingEnum.default('NEVER'),
  packYears: z.number().min(0).max(150).default(0),
  activityPerWeek: z.number().int().min(0).max(14).default(0),
  familyHistoryCvd: z.boolean().default(false),
  onStatins: z.boolean().default(false),
});
export type BiomarkerBody = z.infer<typeof BiomarkerBody>;
