import { z } from 'zod';
import { CHAT_STATUS } from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

export const listConversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(CHAT_STATUS).optional(),
  /** Endpoint staff: ambil antrean yang belum ada staff yang menangani. */
  unassigned: booleanQuery.optional(),
});

export const createConversationSchema = z.object({
  topic: z.string().trim().min(3, 'Topik minimal 3 karakter').max(150),
  /** Customer boleh menyertakan pesan pembuka. */
  initialMessage: z.string().trim().min(1).max(2000).optional(),
});

export const listMessageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  after: z.string().optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(4000),
  attachmentStorageKey: z.string().trim().max(500).optional(),
});

export const conversationIdParamSchema = z.object({ id: uuidSchema });

export const updateConversationSchema = z.object({
  status: z.enum(CHAT_STATUS),
  assignedStaffId: uuidSchema.nullable().optional(),
});

export const assignConversationSchema = z.object({
  assignedStaffId: uuidSchema,
});

export type ListConversationQuery = z.infer<typeof listConversationQuerySchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type ListMessageQuery = z.infer<typeof listMessageQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;