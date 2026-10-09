import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { aiLimiter, readLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  aiChatSchema,
  aiConversationIdParamSchema,
  listAiConversationQuerySchema,
  listAiMessageQuerySchema,
} from '../validators/ai.validator.js';

export const aiRouter = Router();

// POST /ai/chat - kirim pesan ke asisten; aiLimiter menjaga kuota token
aiRouter.post(
  '/ai/chat',
  authenticate,
  aiLimiter,
  validate({ body: aiChatSchema }),
  asyncHandler(aiController.chat),
);

// GET /ai/conversations - daftar percakapan milik pengguna sendiri
aiRouter.get(
  '/ai/conversations',
  authenticate,
  readLimiter,
  validate({ query: listAiConversationQuerySchema }),
  asyncHandler(aiController.listConversations),
);

// GET /ai/conversations/:id/messages - riwayat pesan pada satu percakapan
aiRouter.get(
  '/ai/conversations/:id/messages',
  authenticate,
  readLimiter,
  validate({ params: aiConversationIdParamSchema, query: listAiMessageQuerySchema }),
  asyncHandler(aiController.listMessages),
);

// POST /ai/conversations/:id/close - tutup percakapan
aiRouter.post(
  '/ai/conversations/:id/close',
  authenticate,
  aiLimiter,
  validate({ params: aiConversationIdParamSchema }),
  asyncHandler(aiController.close),
);

// GET /ai/conversations/:id - detail percakapan (daftarkan setelah sub-path di atas)
aiRouter.get(
  '/ai/conversations/:id',
  authenticate,
  readLimiter,
  validate({ params: aiConversationIdParamSchema }),
  asyncHandler(aiController.detail),
);
