import { z } from 'zod';
import { OTP_PURPOSE } from '../config/constants.js';
import { emailSchema, isoDateTime, otpCodeSchema, passwordSchema, phoneSchema } from './common.validator.js';

const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Nama minimal 2 karakter')
  .max(120, 'Nama maksimal 120 karakter');

export const registerSchema = z
  .object({
    email: emailSchema.optional(),
    phoneE164: phoneSchema.optional(),
    password: passwordSchema,
    displayName: displayNameSchema,
    marketingOptIn: z.boolean().default(false),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format birthDate harus YYYY-MM-DD').optional(),
    deviceLabel: z.string().trim().max(120).optional(),
  })
  .refine((value) => Boolean(value.email) || Boolean(value.phoneE164), {
    message: 'Wajib mengisi email atau nomor telepon',
    path: ['email'],
  })
  .refine((value) => !value.email || !value.phoneE164 || value.email !== value.phoneE164, {
    message: 'Email dan nomor telepon tidak boleh sama',
    path: ['phoneE164'],
  });

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3, 'Isi email atau nomor telepon').max(255),
    password: z.string().min(1, 'Password wajib diisi').max(128),
    deviceLabel: z.string().trim().max(120).optional(),
  });

export const logoutSchema = z.object({
  /** Kosongkan untuk logout dari semua perangkat. */
  allDevices: z.boolean().default(false),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});



export const otpRequestSchema = z.object({
  phoneE164: phoneSchema,
  purpose: z.enum(OTP_PURPOSE),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const otpVerifySchema = z.object({
  phoneE164: phoneSchema,
  purpose: z.enum(OTP_PURPOSE),
  code: otpCodeSchema,
  displayName: displayNameSchema.optional(),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
});

/**
 * Reset password memakai OTP terbaru yang belum dipakai pada identifier tersebut,
 * sehingga tidak ada "reset token" tambahan yang harus disimpan di client.
 */
export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

export const oauthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20, 'idToken tidak valid'),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password lama wajib diisi'),
  newPassword: passwordSchema,
});

export const listSessionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type OAuthInput = z.infer<typeof oauthSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Re-export untuk sozial media /-import
export { displayNameSchema, isoDateTime };