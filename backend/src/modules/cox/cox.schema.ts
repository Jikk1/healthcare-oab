import { z } from 'zod';

/**
 * Валидация запроса на подгонку модели Кокса. Жёсткие лимиты размера —
 * защита от чрезмерной нагрузки на синхронный расчётный модуль.
 */
const MAX_OBS = 5000;
const MAX_COVARIATES = 30;

export const CoxObservationSchema = z.object({
  time: z.number().positive(),
  event: z.union([z.literal(0), z.literal(1)]),
  x: z.array(z.number().finite()).min(1).max(MAX_COVARIATES),
});

export const CoxProfileSchema = z.object({
  label: z.string().min(1).max(80),
  x: z.array(z.number().finite()).min(1).max(MAX_COVARIATES),
});

export const CoxFitRequestSchema = z
  .object({
    observations: z.array(CoxObservationSchema).min(10).max(MAX_OBS),
    covariateNames: z.array(z.string().min(1).max(80)).min(1).max(MAX_COVARIATES),
    profiles: z.array(CoxProfileSchema).max(10).optional(),
    calibrationHorizon: z.number().positive().optional(),
  })
  .refine((b) => b.observations.every((o) => o.x.length === b.covariateNames.length), {
    message: 'Длина вектора ковариат должна совпадать с числом covariateNames',
  })
  .refine((b) => !b.profiles || b.profiles.every((p) => p.x.length === b.covariateNames.length), {
    message: 'Длина вектора профиля должна совпадать с числом covariateNames',
  });

export type CoxFitRequest = z.infer<typeof CoxFitRequestSchema>;
