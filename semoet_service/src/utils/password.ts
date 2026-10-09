import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ValidationError, type ErrorDetail } from '../errors/AppError.js';

export interface PasswordPolicyResult {
  valid: boolean;
  failures: ErrorDetail[];
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/** Generate password acak yang kuat (untuk reset password via admin / passwordless invite). */
export function generateStrongPassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;

  const pick = (source: string) => source[crypto.randomInt(0, source.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  while (chars.length < length) chars.push(pick(all));
  // Fisher-Yates shuffle dengan RNG kriptografis
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const failures: ErrorDetail[] = [];
  const push = (field: string, message: string) => failures.push({ field, message });

  if (password.length < 8) push('password', 'Minimal 8 karakter');
  if (password.length > 128) push('password', 'Maksimal 128 karakter');
  if (!/[a-z]/.test(password)) push('password', 'Harus mengandung huruf kecil');
  if (!/[A-Z]/.test(password)) push('password', 'Harus mengandung huruf besar');
  if (!/\d/.test(password)) push('password', 'Harus mengandung angka');

  return { valid: failures.length === 0, failures };
}

export function assertPasswordStrength(password: string): void {
  const { valid, failures } = validatePasswordStrength(password);
  if (!valid) {
    throw new ValidationError('Password tidak memenuhi kebijakan keamanan', failures);
  }
}

/** Normalisasi input login: email lowercase + trim. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalisasi nomor telepon ke format E.164 (mis. +6281234567890). */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim().replace(/[\s()-]/g, '');
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  if (!/^\+\d{8,15}$/.test(withPlus)) {
    throw new ValidationError('Nomor telepon tidak valid (gunakan format E.164, contoh +6281234567890)', [
      { field: 'phone', message: 'Format harus +<kode negara><nomor>, 8-15 digit' },
    ]);
  }
  return withPlus;
}

/** Samarkan nomor untuk ditampilkan di log: +6281****5678 */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 8) return phone;
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}