import crypto from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { logger } from '../config/logger.js';
import { UnauthorizedError } from '../errors/AppError.js';

/**
 * Verifikasi idToken dari Google & Apple.
 *
 * Google  : endpoint tokeninfo resmi (ringkas, tidak perlu cache JWKS).
 * Apple   : JWKS RSA, diverifikasi lokal dengan jsonwebtoken + crypto JWK.
 *
 * idToken dari client WAJIB diverifikasi di server; decode tanpa verifikasi
 * hanya boleh dipakai untuk UI, bukan untuk mengambil keputusan auth.
 */

export interface OAuthProfile {
  provider: 'google' | 'apple';
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

let appleJwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * Definisi lokal JWK. `JsonWebKey` bawaan browser tidak tersedia karena
 * project ini tidak memakai DOM lib, jadi didefinisikan minimum di sini
 * dan tetap kompatibel dengan `crypto.createPublicKey({ format: 'jwk' })`.
 */
interface Jwk {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

interface AppleJwksSet {
  keys: Jwk[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    });

    if (!response.ok) {
      throw new UnauthorizedError('Token OAuth tidak dapat diverifikasi');
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<OAuthProfile> {
  const info = await fetchJson<{
    sub: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    aud?: string;
  }>(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);

  if (!info.sub) throw new UnauthorizedError('Token Google tidak valid');

  return {
    provider: 'google',
    subject: info.sub,
    email: info.email ?? null,
    emailVerified: info.email_verified === true || info.email_verified === 'true',
    displayName: info.name ?? null,
  };
}

async function getAppleJwks(): Promise<AppleJwksSet> {
  const now = Date.now();
  if (appleJwksCache && now - appleJwksCache.fetchedAt < JWKS_TTL_MS) return appleJwksCache;

  const jwks = await fetchJson<AppleJwksSet>(APPLE_JWKS_URL);
  appleJwksCache = { keys: jwks.keys, fetchedAt: now };
  return jwks;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

export async function verifyAppleIdToken(idToken: string): Promise<OAuthProfile> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new UnauthorizedError('Format idToken Apple tidak valid');

  const header = decodeSegment<{ kid?: string; alg?: string }>(parts[0]);
  if (!header.kid) throw new UnauthorizedError('Header idToken Apple tidak lengkap');

  const jwks = await getAppleJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new UnauthorizedError('Public key Apple tidak ditemukan');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });

  let payload: JwtPayload;
  try {
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
    }) as JwtPayload;
  } catch (error) {
    logger.warn({ err: error }, '[oauth] Apple idToken verification failed');
    throw new UnauthorizedError('Token Apple tidak valid');
  }

  // Apple hanya mengirim email pada percakapan pertama; claim bisa berupa array.
  const rawEmail = payload.email;
  const email = Array.isArray(rawEmail) ? String(rawEmail[0]) : rawEmail ? String(rawEmail) : null;

  return {
    provider: 'apple',
    subject: String(payload.sub),
    email: email ? email.toLowerCase() : null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    displayName: typeof payload.name === 'string' ? payload.name : null,
  };
}

export async function verifyOAuthIdToken(
  provider: 'google' | 'apple',
  idToken: string,
): Promise<OAuthProfile> {
  return provider === 'google' ? verifyGoogleIdToken(idToken) : verifyAppleIdToken(idToken);
}