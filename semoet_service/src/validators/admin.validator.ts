import { z } from 'zod';
import { PRODUCT_KIND } from '../config/constants.js';
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
  /** Sertakan anggota yang dihapus (soft delete) agar bisa dipulihkan. */
  includeDeleted: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'suspended', 'deleted']),
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------------
// CRUD user (anggota)
// --------------------------------------------------------------------------
export const createUserSchema = z
  .object({
    email: z.string().trim().email('Email tidak valid').max(160).nullish(),
    phoneE164: z.string().trim().min(8, 'Nomor telepon minimal 8 digit').max(20).nullish(),
    displayName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
    password: z.string().min(8, 'Password minimal 8 karakter').max(128),
    status: z.enum(['active', 'pending', 'suspended']).default('active'),
    roleIds: z.array(uuidSchema).max(10).default([]),
  })
  .refine((value) => Boolean(value.email || value.phoneE164), {
    message: 'Email atau nomor telepon wajib diisi',
    path: ['email'],
  });

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120).optional(),
    email: z.string().trim().email('Email tidak valid').max(160).nullish(),
    phoneE164: z.string().trim().min(8, 'Nomor telepon minimal 8 digit').max(20).nullish(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.email !== undefined ||
      value.phoneE164 !== undefined,
    { message: 'Tidak ada perubahan yang dikirim', path: ['displayName'] },
  );

// --------------------------------------------------------------------------
// CRUD produk & varian
// --------------------------------------------------------------------------
export const productVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('Regular'),
  sku: z.string().trim().max(60).nullish(),
  priceIdr: z.coerce.number().int().min(0).max(1_000_000_000),
  costIdr: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  compareAtPriceIdr: z.coerce.number().int().min(0).max(1_000_000_000).nullish(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(160),
  slug: z
    .string()
    .trim()
    .max(160)
    .regex(/^[a-z0-9-]*$/, 'Slug hanya boleh huruf kecil, angka, dan tanda minus')
    .optional(),
  categoryId: uuidSchema,
  productKind: z.enum(PRODUCT_KIND).default('standard'),
  descriptionShort: z.string().trim().max(2000).nullish(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  variants: z.array(productVariantInputSchema).min(1, 'Minimal satu varian').max(20),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(160).optional(),
    slug: z
      .string()
      .trim()
      .max(160)
      .regex(/^[a-z0-9-]*$/, 'Slug hanya boleh huruf kecil, angka, dan tanda minus')
      .optional(),
    categoryId: uuidSchema.optional(),
    productKind: z.enum(PRODUCT_KIND).optional(),
    descriptionShort: z.string().trim().max(2000).nullish(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
    path: ['name'],
  });

export const updateVariantSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    sku: z.string().trim().max(60).nullish(),
    priceIdr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    costIdr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    compareAtPriceIdr: z.coerce.number().int().min(0).max(1_000_000_000).nullish(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
    path: ['name'],
  });

export const productIdParamSchema = z.object({ id: uuidSchema });
export const productVariantParamSchema = z.object({ id: uuidSchema, variantId: uuidSchema });

export type SalesDashboardQuery = z.infer<typeof salesDashboardQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type ListAdminUserQuery = z.infer<typeof listAdminUserQuerySchema>;