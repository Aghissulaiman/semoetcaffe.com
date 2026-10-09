import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { ValidationError } from '../errors/AppError.js';

/**
 * Helper untuk route webhook yang butuh raw body.
 *
 * CATATAN PENTING urutan middleware:
 * `express.raw({ type: RAW_BODY_TYPE })` harus dipasang pada route webhook
 * SEBELUM `express.json()` global. Body-parser hanya akan membaca stream
 * request satu kali, sehingga raw body harus diambil saat route itu sendiri
 * yang mem-parsing stream (bukan middleware global).
 * Router webhook memasang: express.raw -> captureRawJsonBody -> validate -> handler.
 */
export const RAW_BODY_TYPE = 'application/json';

/** Header signature yang dibaca controller, dipakai berurutan. */
export const WEBHOOK_SIGNATURE_HEADERS = [
  'x-webhook-signature',
  'x-payment-signature',
  'x-midtrans-signature',
] as const;

function hmacDigest(secret: string, payload: Buffer | string): Buffer {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

/**
 * Perbandingan timing-safe. Kedua sisi di-hash dulu supaya panjang string
 * yang berbeda tidak bocor lewat waktu, lalu dibandingkan dengan
 * crypto.timingSafeEqual.
 */
function timingSafeCompare(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightHash = crypto.createHash('sha256').update(right, 'utf8').digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

/**
 * Verifikasi signature webhook (HMAC-SHA256).
 *
 * Kandidat yang dibandingkan:
 * - HMAC(raw body)                          -> header hex/base64 biasa
 * - HMAC(`${timestamp}.${raw body}`)        -> gaya Stripe ("t=...,v1=...")
 *
 * Header yang diterima boleh berisi satu token (hex/base64) atau beberapa
 * pasangan key=value yang dipisah koma.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature || signature.trim().length === 0) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const bodyText = body.toString('utf8');

  const provided: string[] = [];
  const timestamps: string[] = [];

  for (const part of signature.trim().split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf('=');
    const key = separator >= 0 ? trimmed.slice(0, separator).toLowerCase() : '';
    const value = separator >= 0 ? trimmed.slice(separator + 1).trim() : trimmed;

    if (/^t\d+$/.test(key)) timestamps.push(key.slice(1));
    if (key === 'v1' || key === 'v0' || /^sha(1|256|512)$/.test(key)) {
      if (value) provided.push(value);
      continue;
    }
    if (value) provided.push(value);
  }

  if (provided.length === 0) provided.push(signature.trim());

  const candidates: string[] = [];
  const pushCandidates = (payload: Buffer): void => {
    const digest = hmacDigest(secret, payload);
    candidates.push(digest.toString('hex'), digest.toString('base64'));
  };

  pushCandidates(body);
  for (const timestamp of timestamps) {
    pushCandidates(Buffer.from(`${timestamp}.${bodyText}`, 'utf8'));
  }

  return provided.some((value) => candidates.some((candidate) => timingSafeCompare(value, candidate)));
}

/** Raw body sebagai string UTF-8; fallback ke body yang sudah ter-parse. */
export function readRawBody(req: Request): string {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body ?? {});
}

/** Header signature pertama yang tersedia. */
export function readSignatureHeader(req: Request): string | null {
  for (const header of WEBHOOK_SIGNATURE_HEADERS) {
    const value = req.headers[header];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string' && single.trim().length > 0) return single.trim();
  }
  return null;
}

/**
 * Menyimpan byte asli payload ke req.rawBody lalu mengubah req.body menjadi
 * objek JSON supaya middleware validate() (Zod) tetap bisa bekerja pada
 * route webhook.
 */
export const captureRawJsonBody: RequestHandler = (req, _res, next) => {
  try {
    if (!Buffer.isBuffer(req.rawBody)) {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        req.rawBody = Buffer.from(req.body, 'utf8');
      }
    }

    if (Buffer.isBuffer(req.rawBody)) {
      const text = req.rawBody.toString('utf8').trim();
      req.body = text.length === 0 ? {} : JSON.parse(text);
    }

    return next();
  } catch {
    return next(new ValidationError('Body webhook harus berupa JSON yang valid'));
  }
};