import { z } from 'zod';
import { emailSchema, phoneSchema, uuidSchema } from './common.validator.js';

// --------------------------------------------------------------------------
// Profile (/me)
// --------------------------------------------------------------------------
export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120).optional(),
    email: emailSchema.optional(),
    phoneE164: phoneSchema.optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format birthDate harus YYYY-MM-DD').nullable().optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const updatePreferencesSchema = z.object({
  preferences: z.record(z.string(), z.unknown()).default({}),
  merge: z.boolean().default(true),
});

export const preferencesQuerySchema = z.object({
  keys: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------------
// Address (/me/addresses)
// --------------------------------------------------------------------------
const addressBase = {
  label: z.string().trim().min(1, 'Label wajib diisi').max(60),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: phoneSchema,
  addressLine: z.string().trim().min(10, 'Alamat minimal 10 karakter').max(500),
  addressDetail: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().min(2).max(120),
  province: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(10).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().default(false),
};

export const createAddressSchema = z.object(addressBase);

export const updateAddressSchema = z
  .object({
    ...addressBase,
    isDefault: z.boolean().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const addressIdParamSchema = z.object({ id: uuidSchema });

export const listAddressQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isDefault: z.enum(['true', 'false']).optional(),
});

// --------------------------------------------------------------------------
// Family (/me/family)
// --------------------------------------------------------------------------
export const updateFamilySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const createFamilyMemberSchema = z.object({
  displayName: z.string().trim().min(1, 'Nama wajib diisi').max(120),
  relationship: z.string().trim().max(60).nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format birthDate harus YYYY-MM-DD').nullable().optional(),
  /** User existente yang sudah login di aplikasi dan ingin dihubungkan. */
  linkedUserId: uuidSchema.nullable().optional(),
});

export const updateFamilyMemberSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    relationship: z.string().trim().max(60).nullable().optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format birthDate harus YYYY-MM-DD').nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const familyMemberIdParamSchema = z.object({ id: uuidSchema });

// --------------------------------------------------------------------------
// Favorites (/me/favorites)
// --------------------------------------------------------------------------
export const favoriteProductParamSchema = z.object({ productId: uuidSchema });

export const addFavoriteSchema = z.object({
  productId: uuidSchema,
});

export const listFavoriteQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type CreateFamilyMemberInput = z.infer<typeof createFamilyMemberSchema>;
export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>;
export type UpdateFamilyMemberInput = z.infer<typeof updateFamilyMemberSchema>;
export type ListAddressQuery = z.infer<typeof listAddressQuerySchema>;
export type ListFavoriteQuery = z.infer<typeof listFavoriteQuerySchema>;
export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;
export type FavoriteProductParam = z.infer<typeof favoriteProductParamSchema>;