import type { Request, Response } from 'express';
import * as chatService from '../services/chat.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import {
  conversationIdParamSchema,
  type CreateConversationInput,
  type ListConversationQuery,
  type ListMessageQuery,
  type SendMessageInput,
  type UpdateConversationInput,
} from '../validators/chat.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

/** Param id percakapan, di-parse ulang sebagai fallback bila validate tidak terpasang. */
function getConversationId(req: Request): string {
  const params = getParams<{ id: string }>(req);
  const parsed = conversationIdParamSchema.safeParse(params);
  return parsed.success ? parsed.data.id : params.id;
}

// GET /chat/conversations (antrean support untuk staff)
export async function listConversations(req: Request, res: Response): Promise<Response> {
  const result = await chatService.listConversations(
    getQuery<ListConversationQuery>(req),
    getUserId(req),
    isStaffRequest(req),
  );

  return sendPaginated(
    res,
    result.items,
    {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
    },
    { queue: result.queue },
  );
}

// POST /chat/conversations (mulai atau lanjutkan percakapan)
export async function createConversation(req: Request, res: Response): Promise<Response> {
  const data = await chatService.createConversation(
    getUserId(req),
    getBody<CreateConversationInput>(req),
  );
  return sendCreated(res, data);
}

// GET /chat/conversations/:id (detail percakapan)
export async function detail(req: Request, res: Response): Promise<Response> {
  const data = await chatService.getConversation(
    getConversationId(req),
    getUserId(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// PATCH /chat/conversations/:id (ubah status / assign staff)
export async function update(req: Request, res: Response): Promise<Response> {
  const data = await chatService.updateConversation(
    getConversationId(req),
    getBody<UpdateConversationInput>(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// GET /chat/conversations/:id/messages (riwayat pesan)
export async function listMessages(req: Request, res: Response): Promise<Response> {
  const result = await chatService.listMessages(
    getConversationId(req),
    getQuery<ListMessageQuery>(req),
    getUserId(req),
    isStaffRequest(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /chat/conversations/:id/messages (kirim pesan)
export async function sendMessage(req: Request, res: Response): Promise<Response> {
  const data = await chatService.sendMessage(
    getConversationId(req),
    getBody<SendMessageInput>(req),
    getUserId(req),
    isStaffRequest(req),
  );
  return sendCreated(res, data);
}

// POST /admin/chat/conversations/:id/assign (tugaskan percakapan ke staff)
export async function assignStaff(req: Request, res: Response): Promise<Response> {
  const data = await chatService.assignStaff(
    getConversationId(req),
    getBody<chatService.AssignConversationRequest>(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}
