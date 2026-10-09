import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

function dateCompact(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Nomor pesanan: SMO-20260105-8F3K2A
 * Prefix + tanggal (WIB) + 6 karakter acak => mudah dibaca customer,
 * pendek untuk dictate/CS, dan tetap punya entropi tinggi (32^6).
 */
export function generateOrderNumber(prefix = env.ORDER_NUMBER_PREFIX, date = new Date()): string {
  return `${prefix}-${dateCompact(date)}-${randomChunk(6)}`;
}

export function generateReservationNumber(prefix = env.RESERVATION_PREFIX, date = new Date()): string {
  return `${prefix}-${dateCompact(date)}-${randomChunk(5)}`;
}

export function generateEventBookingNumber(
  prefix = env.EVENT_BOOKING_PREFIX,
  date = new Date(),
): string {
  return `${prefix}-${dateCompact(date)}-${randomChunk(5)}`;
}

/** Kode voucher yang mudah diketik: SEMOET-XXXXXX */
export function generateVoucherCode(brand = 'SEMOET', length = 6): string {
  return `${brand}-${randomChunk(length)}`;
}

export function generateFamilyGroupName(ownerDisplayName?: string): string {
  if (!ownerDisplayName) return 'Semoet Family';
  const firstWord = ownerDisplayName.trim().split(/\s+/)[0];
  return `${firstWord} Family`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/** Generate slug unik dengan pengecekan callback (biasanya dipakai di service). */
export async function generateUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  let attempt = 0;

  while (attempt < maxAttempts) {
    if (!(await exists(candidate))) return candidate;
    attempt += 1;
    candidate = `${root}-${randomChunk(3).toLowerCase()}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}