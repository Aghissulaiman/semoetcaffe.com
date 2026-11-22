import { z } from "zod";
import { uuidSchema } from "./common.validator.js";

export const createPreparationStationSchema = z.object({
  name: z.string().trim().min(2, "Nama stasiun minimal 2 karakter").max(80),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Kode hanya boleh huruf kecil, angka, '-' atau '_'")
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const updatePreparationStationSchema = z
  .object({
    name: z.string().trim().min(2, "Nama stasiun minimal 2 karakter").max(80).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9_-]+$/, "Kode hanya boleh huruf kecil, angka, '-' atau '_'")
      .optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim" });

export const preparationStationIdParamSchema = z.object({ id: uuidSchema });

export type CreatePreparationStationInput = z.infer<typeof createPreparationStationSchema>;
export type UpdatePreparationStationInput = z.infer<typeof updatePreparationStationSchema>;
