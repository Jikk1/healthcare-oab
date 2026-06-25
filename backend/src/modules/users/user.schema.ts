import { z } from 'zod';

export const RoleEnum = z.enum([
  'OWNER',
  'ADMIN',
  'CLINICIAN',
  'ANALYST',
  'BILLING',
  'VIEWER',
]);

export const InviteUserBody = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().trim().min(2).max(160),
  role: RoleEnum.default('VIEWER'),
});
export type InviteUserBody = z.infer<typeof InviteUserBody>;

export const ChangeRoleBody = z.object({
  role: RoleEnum,
});
export type ChangeRoleBody = z.infer<typeof ChangeRoleBody>;

export const UpdateMeBody = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
});
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;
