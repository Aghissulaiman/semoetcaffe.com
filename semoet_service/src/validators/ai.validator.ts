import { z } from 'zod';
import { AI_PURPOSE } from '../config/constants.js';
import { uuidSchema } from './common.validator.js';

export const aiChatSchema = z.object({
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(4000),
  conversationId: uuidSchema.nullable().optional(),
  purpose: z.enum(AI_PURPOSE).optional(),
  context: z
    .object({
      orderId: uuidSchema.optional(),
      productId: uuidSchema.optional(),
      branchId: uuidSchema.optional(),
      locale: z.string().trim().max(10).optional(),
    })
    .default({}),
});

export const listAiConversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  purpose: z.enum(AI_PURPOSE).optional(),
  status: z.enum(['open', 'closed']).optional(),
});

export const aiConversationIdParamSchema = z.object({ id: uuidSchema });

export const listAiMessageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AiChatInput = z.infer<typeof aiChatSchema>;
export type ListAiConversationQuery = z.infer<typeof listAiConversationQuerySchema>;
export type ListAiMessageQuery = z.infer<typeof listAiMessageQuerySchema>;