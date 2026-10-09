import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { TooManyRequestsError } from '../errors/AppError.js';

function keyGeneratorByIp(req: Request): string {
  return req.ip ?? 'unknown';
}

function keyGeneratorByIpAndUser(req: Request): string {
  const ip = req.ip ?? 'unknown';
  return req.user?.id ? `${ip}:${req.user.id}` : ip;
}

function build(options: Partial<Options> & { limit: number; windowMs: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: keyGeneratorByIp,
    handler: (_req: Request, _res: Response) => {
      logger.warn({ ip: _req.ip }, '[rate-limit] limit exceeded');
      throw new TooManyRequestsError(
        'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.',
      );
    },
    ...options,
  });
}

/** Limit global: melindungi dari abuse umum. */
export const globalLimiter = build({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/** Limit ketat untuk endpoint auth & OTP (anti brute force). */
export const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
});

/** Limit untuk pengiriman OTP: max 3 permintaan per 15 menit. */
export const otpLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 3,
});

/** Limit untuk write endpoint (create order, review, chat). */
export const writeLimiter = build({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: keyGeneratorByIpAndUser,
});

/** Limit untuk AI chat supaya tidak membakar kuota token. */
export const aiLimiter = build({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: keyGeneratorByIpAndUser,
});

/** Limit endpoint publik yang berat (katalog, dashboard). */
export const readLimiter = build({
  windowMs: 60 * 1000,
  limit: 120,
});