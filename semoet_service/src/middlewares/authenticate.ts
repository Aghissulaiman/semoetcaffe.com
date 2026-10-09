import type { NextFunction, Request, Response } from 'express';
import { db } from '../config/database.js';
import { ROLE_CODE } from '../config/constants.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { camelizeRow } from '../utils/serialize.js';
import { asyncHandler } from './asyncHandler.js';

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = BEARER_PATTERN.exec(header.trim());
  return match ? match[1].trim() : null;
}

interface UserAuthRow {
  id: string;
  email: string | null;
  phone_e164: string | null;
  display_name: string;
  status: string;
  deleted_at: Date | null;
}

/**
 * Memuat user + role + permission dari DB.
 * Dipanggil setiap request karena status user bisa berubah kapan saja
 * (suspend/delete) dan permission bisa di-update admin.
 */
async function loadAuthContext(userId: string, sessionId: string) {
  const user = await db.queryOne<UserAuthRow>(
    `SELECT id, email, phone_e164, display_name, status, deleted_at
       FROM users
      WHERE id = $1`,
    [userId],
  );

  if (!user) throw new UnauthorizedError('User tidak ditemukan atau telah dihapus');
  if (user.deleted_at) throw new UnauthorizedError('Akun telah dihapus');
  if (user.status === 'suspended') throw new UnauthorizedError('Akun sedang dinonaktifkan');
  if (user.status === 'deleted') throw new UnauthorizedError('Akun telah dihapus');
  if (user.status === 'pending' && !user.email && !user.phone_e164) {
    throw new UnauthorizedError('Verifikasi akun Anda terlebih dahulu');
  }

  const roles = await db.queryMany<{ code: string; name: string }>(
    `SELECT r.code, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code`,
    [userId],
  );

  const permissions = await db.queryMany<{ resource: string; action: string }>(
    `SELECT DISTINCT p.resource, p.action
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      ORDER BY p.resource, p.action`,
    [userId],
  );

  const roleCodes = roles.map((role) => role.code);
  const permissionKeys = permissions.map((permission) => `${permission.resource}:${permission.action}`);
  const isSuperAdmin = roleCodes.includes(ROLE_CODE.SUPER_ADMIN);
  const isStaff = roleCodes.some((code) =>
    [ROLE_CODE.SUPER_ADMIN, ROLE_CODE.ADMIN, ROLE_CODE.BRANCH_MANAGER, ROLE_CODE.STAFF].includes(
      code as never,
    ),
  );

  return {
    id: user.id,
    sessionId,
    email: user.email,
    phone: user.phone_e164,
    displayName: user.display_name,
    status: user.status,
    roles,
    roleCodes,
    permissions,
    permissionKeys,
    isSuperAdmin,
    isStaff,
  };
}

/** Wajib login. Pasang di router yang butuh identitas user. */
export const authenticate = asyncHandlerRequest(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw new UnauthorizedError('Header Authorization dengan Bearer token wajib diisi');

  const payload = verifyAccessToken(token);
  req.user = await loadAuthContext(payload.userId, payload.sessionId);
  next();
});

export const requireAuth = authenticate;

/**
 * Opsional login: dipakai endpoint publik yang responsnya berbeda
 * untuk user yang sudah login (mis. GET /products → isFavorite).
 */
export const optionalAuthenticate = asyncHandlerRequest(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = await loadAuthContext(payload.userId, payload.sessionId);
  } catch {
    // token tidak valid pada endpoint optional = diperlakukan sebagai anonim
  }
  next();
});

/**
 * Pastikan sesi pada user_sessions masih aktif (belum revoked / belum kedaluwarsa).
 * Dipakai pada endpoint sensitif seperti refresh, logout, dan ubah password.
 */
export const requireActiveSession = asyncHandlerRequest(async (req, _res, next) => {
  if (!req.user) throw new UnauthorizedError();

  const session = await db.queryOne<{ id: string; revoked_at: Date | null; expires_at: Date }>(
    `SELECT id, revoked_at, expires_at
       FROM user_sessions
      WHERE id = $1
      FOR UPDATE`,
    [req.user.sessionId],
  );

  if (!session) throw new UnauthorizedError('Sesi tidak ditemukan, silakan login ulang');
  if (session.revoked_at) throw new UnauthorizedError('Sesi sudah diakhiri, silakan login ulang');
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new UnauthorizedError('Sesi kedaluwarsa, silakan login ulang');
  }

  next();
});

// Helper kecil agar tipe handler konsisten dengan asyncHandler.
function asyncHandlerRequest(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return asyncHandler(handler);
}

export const __internal = { loadAuthContext, camelizeRow };