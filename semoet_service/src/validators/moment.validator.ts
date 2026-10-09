import { z } from 'zod';
import { MEDIA_TYPE, MOMENT_MODERATION_STATUS } from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

const momentMediaSchema = z.object({
  storageKey: z.string().trim().min(3).max(500),
  publicUrl: z.string().trim().url('publicUrl harus berupa URL valid').max(1000).nullable().optional(),
  mediaType: z.enum(MEDIA_TYPE).default('image'),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
});

export const listMomentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  eventType: z.enum(['community', 'birthday', 'wedding', 'event', 'other']).optional(),
  userId: uuidSchema.optional(),
  /** Endpoint publik hanya menampilkan moment approved. */
  mine: booleanQuery.optional(),
});

export const createMomentSchema = z
  .object({
    title: z.string().trim().max(150).nullable().optional(),
    caption: z.string().trim().max(2200).nullable().optional(),
    eventType: z.enum(['community', 'birthday', 'wedding', 'event', 'other']).nullable().optional(),
    media: z.array(momentMediaSchema).max(10).default([]),
  })
  .refine(
    (value) => Boolean(value.caption) || value.media.length > 0,
    { message: 'Caption atau minimal satu media wajib diisi', path: ['caption'] },
  );

export const updateMomentSchema = z
  .object({
    title: z.string().trim().max(150).nullable().optional(),
    caption: z.string().trim().max(2200).nullable().optional(),
    eventType: z.enum(['community', 'birthday', 'wedding', 'event', 'other']).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const moderateMomentSchema = z.object({
  moderationStatus: z.enum(MOMENT_MODERATION_STATUS),
  note: z.string().trim().max(500).optional(),
});

export const momentIdParamSchema = z.object({ id: uuidSchema });

export type ListMomentQuery = z.infer<typeof listMomentQuerySchema>;
export type CreateMomentInput = z.infer<typeof createMomentSchema>;
export type UpdateMomentInput = z.infer<typeof updateMomentSchema>;