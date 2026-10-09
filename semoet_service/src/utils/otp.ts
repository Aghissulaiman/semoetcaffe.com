import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * OTP tidak disimpan dalam bentuk plaintext: hanya SHA-256(code + serverSecret)
 * yang masuk ke kolom otp_requests.code_hash.
 */
export function generateNumericOtp(length: number = env.OTP_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

export function hashOtp(code: string): string {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`otp:${code}`).digest('hex');
}

export function otpExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + env.OTP_TTL_SECONDS * 1000);
}

export function isOtpExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** Bandingkan hash secara timing-safe. */
export function verifyOtp(code: string, codeHash: string): boolean {
  const candidate = Buffer.from(hashOtp(code));
  const expected = Buffer.from(codeHash);
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function otpCooldownSeconds(requestedAt: Date | string, now: Date = new Date()): number {
  const elapsed = (now.getTime() - new Date(requestedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(60 - elapsed));
}