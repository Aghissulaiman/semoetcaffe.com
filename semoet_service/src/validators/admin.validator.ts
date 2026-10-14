import { z } from 'zod';
import { dateSchema, uuidSchema } from './common.validator.js';

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
export const salesDashboardQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(365).default(30),
});

export const salesSummaryQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
});

export const topProductQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// --------------------------------------------------------------------------
// Laporan penjualan
// --------------------------------------------------------------------------
export const reportSalesQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
});

export const reportProductQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['revenue_desc', 'profit_desc', 'qty_desc', 'name_asc']).default('revenue_desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --------------------------------------------------------------------------
// Harga modal (HPP) varian produk
// --------------------------------------------------------------------------
export const updateVariantCostsSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: uuidSchema,
        costIdr: z.coerce.number().int().min(0).max(1_000_000_000),
      }),
    )
    .min(1, 'Minimal satu varian')
    .max(50),
});

// --------------------------------------------------------------------------
// Audit log
// --------------------------------------------------------------------------
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  actorUserId: uuidSchema.optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuidSchema.optional(),
  requestId: z.string().trim().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// --------------------------------------------------------------------------
// Role & permission
// --------------------------------------------------------------------------
export const listRoleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  code: z.string().trim().max(60).optional(),
});

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Code hanya boleh lowercase, angka, underscore'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  permissionKeys: z
    .array(
      z.string().regex(/^[a-z_]+:[a-z_]+$/, 'Format permission harus resource:action'),
    )
    .max(200)
    .default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  permissionKeys: z.array(z.string().regex(/^[a-z_]+:[a-z_]+$/)).max(200).optional(),
});

export const listPermissionQuerySchema = z.object({
  resource: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
});

export const assignRoleSchema = z.object({
  roleIds: z.array(uuidSchema).min(1, 'Minimal satu role').max(10),
  /** Ganti seluruh role user bila true, selain itu tambahkan. */
  replace: z.boolean().default(false),
});

export const userIdParamSchema = z.object({ id: uuidSchema });

export const listAdminUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['active', 'pending', 'suspended', 'deleted']).optional(),
  roleCode: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'suspended', 'deleted']),
  reason: z.string().trim().max(500).optional(),
});

export type SalesDashboardQuery = z.infer<typeof salesDashboardQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type ListAdminUserQuery = z.infer<typeof listAdminUserQuerySchema>;