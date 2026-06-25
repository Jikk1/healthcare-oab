import { z } from 'zod';

export const ChangePlanBody = z.object({
  plan: z.enum(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE']),
});
export type ChangePlanBody = z.infer<typeof ChangePlanBody>;
