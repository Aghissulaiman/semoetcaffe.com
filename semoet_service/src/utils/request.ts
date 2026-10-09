import type { Request } from 'express';

/** Query string yang sudah tervalidasi (fallback ke req.query mentah). */
export function getQuery<T>(req: Request): T {
  return (req.validatedQuery ?? req.query) as T;
}

/** Body yang sudah divalidasi. */
export function getBody<T>(req: Request): T {
  return (req.validatedBody ?? req.body) as T;
}

/** Params yang sudah divalidasi. */
export function getParams<T extends Record<string, string>>(req: Request): T {
  return (req.validatedParams ?? req.params) as T;
}

export function getIp(req: Request): string | null {
  const ip = req.ip ?? (req.socket.remoteAddress ?? null);
  return ip && ip !== '::1' && ip !== '::ffff:127.0.0.1' ? ip : null;
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 255) : null;
}

/** Body idempotency key: middleware idempotency() sudah menyalin header ke req. */
export function getIdempotencyKey(req: Request): string | null {
  return typeof req.idempotencyKey === 'string' && req.idempotencyKey.length > 0
    ? req.idempotencyKey
    : null;
}

/** User id dari middleware authenticate; throws bila handler lupa pasang auth. */
export function getUserId(req: Request): string {
  if (!req.user) throw new Error('authenticate middleware belum dijalankan pada route ini');
  return req.user.id;
}