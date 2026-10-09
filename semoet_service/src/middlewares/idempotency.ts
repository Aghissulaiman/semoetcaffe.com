import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../errors/AppError.js';

const HEADER = 'idempotency-key';
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Membaca header Idempotency-Key untuk endpoint yang berpotensi dobel-kirim
 * dari mobile (create order, create charge, gamification play, redeem poin).
 * Penyimpanan & pengecekan idempotensi tetap di service karena masing-masing
 * punya tabel/kolom idempotency_key sendiri (payment_transactions,
 * gamification_plays, point_ledger, order_number unik).
 */
export function idempotency() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const raw = req.headers[HEADER];

    if (raw === undefined) {
      req.idempotencyKey = null as unknown as string;
      return next();
    }

    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || value.trim().length < MIN_LENGTH) {
      return next(
        new ValidationError(`Header ${HEADER} minimal ${MIN_LENGTH} karakter`, [
          { field: HEADER, message: `Minimal ${MIN_LENGTH} karakter` },
        ]),
      );
    }

    const normalized = value.trim();
    if (normalized.length > MAX_LENGTH || !PATTERN.test(normalized)) {
      return next(
        new ValidationError(`Header ${HEADER} tidak valid`, [
          { field: HEADER, message: `Maksimal ${MAX_LENGTH} karakter dan hanya karakter alfanumerik, . _ : -` },
        ]),
      );
    }

    req.idempotencyKey = normalized;
    return next();
  };
}