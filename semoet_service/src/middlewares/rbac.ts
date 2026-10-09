import type { RequestHandler } from 'express';
import { ACTIONS, ROLE_CODE, type RoleCode } from '../config/constants.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

const STAFF_ROLES: RoleCode[] = [
  ROLE_CODE.SUPER_ADMIN,
  ROLE_CODE.ADMIN,
  ROLE_CODE.BRANCH_MANAGER,
  ROLE_CODE.STAFF,
];

function ensureAuthenticated(req: { user?: unknown }): void {
  if (!req.user) throw new UnauthorizedError();
}

/** Wajib punya salah satu role dari daftar (super admin selalu lolos). */
export function requireRoles(...roles: RoleCode[]): RequestHandler {
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      const user = req.user!;

      if (user.isSuperAdmin) return next();
      const allowed = new Set<string>(roles);
      const hasRole = user.roleCodes.some((code) => allowed.has(code));
      if (!hasRole) {
        throw new ForbiddenError(
          `Endpoint ini hanya untuk role: ${roles.join(', ')}`,
        );
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/** Staff = admin / branch manager / staff / super admin. */
export const requireStaff: RequestHandler = requireRoles(...STAFF_ROLES);

export const requireAdmin: RequestHandler = requireRoles(ROLE_CODE.SUPER_ADMIN, ROLE_CODE.ADMIN);

/** Wajib punya permission resource:action spesifik (super admin selalu lolos). */
export function requirePermission(resource: string, action: string = ACTIONS.MANAGE): RequestHandler {
  const key = `${resource}:${action}`;
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      const user = req.user!;

      if (user.isSuperAdmin) return next();
      if (!user.permissionKeys.includes(key)) {
        throw new ForbiddenError(`Permission '${key}' diperlukan untuk akses endpoint ini`);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/** Semua permission yang diminta harus dimiliki. */
export function requireAllPermissions(...keys: string[]): RequestHandler {
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      const user = req.user!;

      if (user.isSuperAdmin) return next();
      const missing = keys.filter((key) => !user.permissionKeys.includes(key));
      if (missing.length > 0) {
        throw new ForbiddenError(`Permission belum dimiliki: ${missing.join(', ')}`);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Staff yang hanya boleh menangani data branch-nya sendiri.
 * Wajib dipakai setelah requireStaff untuk endpoint admin scoped per cabang.
 */
export function enforceBranchScope(req: Parameters<RequestHandler>[0]): void {
  const user = req.user;
  if (!user) throw new UnauthorizedError();
  if (user.isSuperAdmin || user.roleCodes.includes(ROLE_CODE.ADMIN)) return;

  const requestedBranchId = (req.params as Record<string, string>).branchId;
  if (!requestedBranchId) {
    throw new ForbiddenError('Staff wajib memberikan branchId pada request');
  }
}