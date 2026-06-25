import { z } from 'zod';

// Password policy: length over complexity (NIST 800-63B). Reject the obvious.
const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .refine((p) => !/^(password|123456|qwerty)/i.test(p), 'Password is too common');

export const RegisterBody = z.object({
  email: z.string().email().toLowerCase(),
  password,
  fullName: z.string().trim().min(2).max(160),
  organizationName: z.string().trim().min(2).max(160),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
  // Optional TOTP code when the account has MFA enabled.
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const RequestResetBody = z.object({
  email: z.string().email().toLowerCase(),
});

export const ConfirmResetBody = z.object({
  token: z.string().min(1),
  password,
});

export const MfaVerifyBody = z.object({
  code: z.string().regex(/^\d{6}$/),
});
