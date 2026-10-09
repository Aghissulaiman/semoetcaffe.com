import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ErrorCode, UnauthorizedError } from '../errors/AppError.js';

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  userId: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  tokenType: 'access';
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  userId: string;
  sessionId: string;
  tokenType: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  accessTokenExpiresAt: string;
  tokenType: 'Bearer';
}

/** Ubah durasi "15m"/"30d"/"3600" menjadi detik. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])?$/.exec(duration.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return value * (multiplier[unit] ?? 1);
}

export function signAccessToken(payload: {
  userId: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  roles: string[];
}): { token: string; expiresAt: string } {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    subject: payload.userId,
  };

  const token = jwt.sign(
    {
      userId: payload.userId,
      sessionId: payload.sessionId,
      email: payload.email,
      phone: payload.phone,
      roles: payload.roles,
      tokenType: 'access',
    },
    env.JWT_ACCESS_SECRET,
    options,
  );

  const ttlSeconds = durationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
  return {
    token,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

export function signRefreshToken(payload: { userId: string; sessionId: string }): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    subject: payload.userId,
  };

  return jwt.sign(
    { userId: payload.userId, sessionId: payload.sessionId, tokenType: 'refresh' },
    env.JWT_REFRESH_SECRET,
    options,
  );
}

function mapJwtError(error: unknown): never {
  if (error instanceof jwt.TokenExpiredError) {
    throw new UnauthorizedError('Token sudah kedaluwarsa', ErrorCode.TOKEN_EXPIRED);
  }
  if (error instanceof jwt.JsonWebTokenError) {
    throw new UnauthorizedError('Token tidak valid', ErrorCode.TOKEN_INVALID);
  }
  throw new UnauthorizedError('Autentikasi gagal');
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as AccessTokenPayload;

    if (decoded.tokenType !== 'access' || !decoded.userId || !decoded.sessionId) {
      throw new UnauthorizedError('Jenis token tidak sesuai', ErrorCode.TOKEN_INVALID);
    }
    return decoded;
  } catch (error) {
    return mapJwtError(error);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as RefreshTokenPayload;

    if (decoded.tokenType !== 'refresh' || !decoded.userId || !decoded.sessionId) {
      throw new UnauthorizedError('Jenis token tidak sesuai', ErrorCode.TOKEN_INVALID);
    }
    return decoded;
  } catch (error) {
    return mapJwtError(error);
  }
}

/**
 * Refresh token disimpan di DB sebagai hash (user_sessions.refresh_token_hash)
 * sehingga pencabutan sesi bisa dilakukan seketika (revoke/logout per device).
 */
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function secureCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function buildTokenPair(params: {
  userId: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  roles: string[];
}): TokenPair {
  const access = signAccessToken(params);
  const refresh = signRefreshToken({ userId: params.userId, sessionId: params.sessionId });

  return {
    accessToken: access.token,
    refreshToken: refresh,
    accessTokenExpiresIn: durationToSeconds(env.JWT_ACCESS_EXPIRES_IN),
    accessTokenExpiresAt: access.expiresAt,
    tokenType: 'Bearer',
  };
}

export function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + durationToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000);
}