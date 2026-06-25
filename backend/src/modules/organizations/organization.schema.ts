import { z } from 'zod';

export const UpdateOrganizationBody = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  timezone: z.string().trim().min(2).max(64).optional(),
});
export type UpdateOrganizationBody = z.infer<typeof UpdateOrganizationBody>;
