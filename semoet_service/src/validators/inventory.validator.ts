import { z } from 'zod';
import { MOVEMENT_TYPE } from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

export const listIngredientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  isActive: booleanQuery.optional(),
  q: z.string().trim().max(120).optional(),
  /** Tampilkan bahan yang stoknya <= reorder_level. */
  lowStockOnly: booleanQuery.default(false),
});

export const createIngredientSchema = z.object({
  sku: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, 'SKU hanya alphanumeric, titik, underscore, strip'),
  name: z.string().trim().min(2).max(150),
  baseUnit: z.string().trim().min(1).max(30),
  reorderLevel: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateIngredientSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    baseUnit: z.string().trim().max(30).optional(),
    reorderLevel: z.coerce.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const listRecipeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  productVariantId: uuidSchema.optional(),
  ingredientId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
});

export const upsertRecipeSchema = z
  .object({
    productVariantId: uuidSchema,
    ingredients: z
      .array(
        z.object({
          ingredientId: uuidSchema,
          quantityInBaseUnit: z.coerce.number().positive('Kuantitas harus > 0'),
          expectedWastePercent: z.coerce.number().min(0).max(100).default(0),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine((value) => value.ingredients.length > 0, {
    message: 'Recipe harus memiliki minimal satu bahan',
    path: ['ingredients'],
  });

export const listStockLocationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createStockLocationSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const listMovementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  stockLocationId: uuidSchema.optional(),
  ingredientId: uuidSchema.optional(),
  movementType: z.enum(MOVEMENT_TYPE).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Tanggal transaksi (YYYY-MM-DD) untuk pencatatan/transfer stok. */
const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .optional();

export const createMovementSchema = z
  .object({
    stockLocationId: uuidSchema,
    ingredientId: uuidSchema,
    quantityDelta: z.coerce
      .number()
      .refine((value) => value !== 0, 'quantityDelta tidak boleh 0'),
    movementType: z.enum(MOVEMENT_TYPE),
    movementDate: dateOnlySchema,
    referenceType: z.string().trim().max(60).optional(),
    referenceId: uuidSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) =>
      !['transfer_in', 'transfer_out'].includes(value.movementType) ||
      (value.referenceType && value.referenceId),
    {
      message: 'Transfer wajib menyertakan referenceType dan referenceId',
      path: ['referenceType'],
    },
  );

export const transferStockSchema = z
  .object({
    fromStockLocationId: uuidSchema,
    toStockLocationId: uuidSchema,
    ingredientId: uuidSchema,
    quantity: z.coerce.number().positive('Jumlah transfer harus lebih dari 0'),
    movementDate: dateOnlySchema,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.fromStockLocationId !== value.toStockLocationId, {
    message: 'Lokasi asal dan tujuan tidak boleh sama',
    path: ['toStockLocationId'],
  });

export const stockSnapshotQuerySchema = z.object({
  stockLocationId: uuidSchema.optional(),
});

const stockOutItemSchema = z.object({
  ingredientId: uuidSchema,
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0'),
  notes: z.string().trim().max(300).optional(),
});

export const listStockOutQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  fromStockLocationId: uuidSchema.optional(),
  toStockLocationId: uuidSchema.optional(),
  from: dateOnlySchema,
  to: dateOnlySchema,
});

export const createStockOutSchema = z
  .object({
    fromStockLocationId: uuidSchema,
    toStockLocationId: uuidSchema,
    transferDate: dateOnlySchema,
    notes: z.string().trim().max(500).optional(),
    postNow: z.boolean().default(false),
    items: z.array(stockOutItemSchema).min(1, 'Minimal satu bahan harus diisi').max(100),
  })
  .superRefine((value, ctx) => {
    if (value.fromStockLocationId === value.toStockLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lokasi asal dan tujuan tidak boleh sama',
        path: ['toStockLocationId'],
      });
    }
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.ingredientId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Bahan yang sama tidak boleh dipilih dua kali',
          path: ['items', index, 'ingredientId'],
        });
      }
      seen.add(item.ingredientId);
    });
  });

export const updateStockOutSchema = z
  .object({
    fromStockLocationId: uuidSchema.optional(),
    toStockLocationId: uuidSchema.optional(),
    transferDate: dateOnlySchema,
    notes: z.string().trim().max(500).nullable().optional(),
    items: z.array(stockOutItemSchema).min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimal satu field harus dikirim',
      });
    }
    if (
      value.fromStockLocationId &&
      value.toStockLocationId &&
      value.fromStockLocationId === value.toStockLocationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lokasi asal dan tujuan tidak boleh sama',
        path: ['toStockLocationId'],
      });
    }
    if (value.items) {
      const seen = new Set<string>();
      value.items.forEach((item, index) => {
        if (seen.has(item.ingredientId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Bahan yang sama tidak boleh dipilih dua kali',
            path: ['items', index, 'ingredientId'],
          });
        }
        seen.add(item.ingredientId);
      });
    }
  });

export const cancelStockDocumentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const stockOpnameItemSchema = z.object({
  ingredientId: uuidSchema,
  countedQuantity: z.coerce.number().min(0, 'Kuantitas fisik tidak boleh negatif'),
  notes: z.string().trim().max(300).optional(),
});

export const listStockOpnameQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  stockLocationId: uuidSchema.optional(),
  from: dateOnlySchema,
  to: dateOnlySchema,
});

export const createStockOpnameSchema = z
  .object({
    stockLocationId: uuidSchema,
    opnameDate: dateOnlySchema,
    notes: z.string().trim().max(500).optional(),
    postNow: z.boolean().default(false),
    items: z.array(stockOpnameItemSchema).min(1, 'Minimal satu bahan harus diisi').max(200),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.ingredientId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Bahan yang sama tidak boleh dipilih dua kali',
          path: ['items', index, 'ingredientId'],
        });
      }
      seen.add(item.ingredientId);
    });
  });

export const updateStockOpnameSchema = z
  .object({
    stockLocationId: uuidSchema.optional(),
    opnameDate: dateOnlySchema,
    notes: z.string().trim().max(500).nullable().optional(),
    items: z.array(stockOpnameItemSchema).min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimal satu field harus dikirim',
      });
    }
    if (value.items) {
      const seen = new Set<string>();
      value.items.forEach((item, index) => {
        if (seen.has(item.ingredientId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Bahan yang sama tidak boleh dipilih dua kali',
            path: ['items', index, 'ingredientId'],
          });
        }
        seen.add(item.ingredientId);
      });
    }
  });

export const stockSummaryQuerySchema = z.object({
  stockLocationId: uuidSchema.optional(),
  from: dateOnlySchema,
  to: dateOnlySchema,
});

export type ListIngredientQuery = z.infer<typeof listIngredientQuerySchema>;
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type ListRecipeQuery = z.infer<typeof listRecipeQuerySchema>;
export type UpsertRecipeInput = z.infer<typeof upsertRecipeSchema>;
export type ListMovementQuery = z.infer<typeof listMovementQuerySchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type ListStockOutQuery = z.infer<typeof listStockOutQuerySchema>;
export type CreateStockOutInput = z.infer<typeof createStockOutSchema>;
export type UpdateStockOutInput = z.infer<typeof updateStockOutSchema>;
export type CancelStockDocumentInput = z.infer<typeof cancelStockDocumentSchema>;
export type ListStockOpnameQuery = z.infer<typeof listStockOpnameQuerySchema>;
export type CreateStockOpnameInput = z.infer<typeof createStockOpnameSchema>;
export type UpdateStockOpnameInput = z.infer<typeof updateStockOpnameSchema>;
export type StockSummaryQuery = z.infer<typeof stockSummaryQuerySchema>;