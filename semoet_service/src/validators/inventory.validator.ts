import { z } from 'zod';
import { MOVEMENT_TYPE } from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

export const listIngredientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  isActive: booleanQuery.optional(),
  q: z.string().trim().max(120).optional(),
  branchId: uuidSchema.optional(),
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
  branchId: uuidSchema.optional(),
});

export const createStockLocationSchema = z.object({
  branchId: uuidSchema,
  name: z.string().trim().min(2).max(80),
});

export const listMovementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  stockLocationId: uuidSchema.optional(),
  ingredientId: uuidSchema.optional(),
  movementType: z.enum(MOVEMENT_TYPE).optional(),
  branchId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const createMovementSchema = z
  .object({
    stockLocationId: uuidSchema,
    ingredientId: uuidSchema,
    quantityDelta: z.coerce
      .number()
      .refine((value) => value !== 0, 'quantityDelta tidak boleh 0'),
    movementType: z.enum(MOVEMENT_TYPE),
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

export const stockSnapshotQuerySchema = z.object({
  branchId: uuidSchema,
  stockLocationId: uuidSchema.optional(),
});

export type ListIngredientQuery = z.infer<typeof listIngredientQuerySchema>;
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type ListRecipeQuery = z.infer<typeof listRecipeQuerySchema>;
export type UpsertRecipeInput = z.infer<typeof upsertRecipeSchema>;
export type ListMovementQuery = z.infer<typeof listMovementQuerySchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;