import { Router } from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  assignConversationSchema,
  conversationIdParamSchema,
  createConversationSchema,
  listConversationQuerySchema,
  listMessageQuerySchema,
  sendMessageSchema,
  updateConversationSchema,
} from '../validators/chat.validator.js';

export const chatRouter = Router();

// GET /chat/conversations (antrean percakapan masuk untuk staff)
chatRouter.get(
  '/chat/conversations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.CHAT, ACTIONS.READ),
  readLimiter,
  validate({ query: listConversationQuerySchema }),
  asyncHandler(chatController.listConversations),
);

// POST /chat/conversations (mulai percakapan baru, atau lanjutkan yang masih open)
chatRouter.post(
  '/chat/conversations',
  authenticate,
  writeLimiter,
  validate({ body: createConversationSchema }),
  asyncHandler(chatController.createConversation),
);

// GET /chat/conversations/:id/messages (riwayat pesan, daftar sebelum /:id)
chatRouter.get(
  '/chat/conversations/:id/messages',
  authenticate,
  readLimiter,
  validate({ params: conversationIdParamSchema, query: listMessageQuerySchema }),
  asyncHandler(chatController.listMessages),
);

// POST /chat/conversations/:id/messages (customer atau staff mengirim pesan)
chatRouter.post(
  '/chat/conversations/:id/messages',
  authenticate,
  writeLimiter,
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  asyncHandler(chatController.sendMessage),
);

// GET /chat/conversations/:id (detail percakapan)
chatRouter.get(
  '/chat/conversations/:id',
  authenticate,
  validate({ params: conversationIdParamSchema }),
  asyncHandler(chatController.detail),
);

// PATCH /chat/conversations/:id (staff mengubah status atau menugaskan staff)
chatRouter.patch(
  '/chat/conversations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.CHAT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: conversationIdParamSchema, body: updateConversationSchema }),
  asyncHandler(chatController.update),
);

// POST /admin/chat/conversations/:id/assign (tugaskan percakapan ke staff tertentu)
chatRouter.post(
  '/admin/chat/conversations/:id/assign',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.CHAT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: conversationIdParamSchema, body: assignConversationSchema }),
  asyncHandler(chatController.assignStaff),
);
