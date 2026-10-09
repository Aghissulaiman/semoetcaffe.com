import type { Request, Response } from 'express';
import * as aiService from '../services/ai.service.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import {
  aiChatSchema,
  listAiConversationQuerySchema,
  listAiMessageQuerySchema,
  type AiChatInput,
  type ListAiConversationQuery,
  type ListAiMessageQuery,
} from '../validators/ai.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

/** Parse ulang query sebagai pengaman bila validate tidak terpasang. */
function parseConversationQuery(req: Request): ListAiConversationQuery {
  const parsed = listAiConversationQuerySchema.safeParse(getQuery(req) ?? {});
  return (parsed.success ? parsed.data : getQuery(req)) as ListAiConversationQuery;
}

function parseMessageQuery(req: Request): ListAiMessageQuery {
  const parsed = listAiMessageQuerySchema.safeParse(getQuery(req) ?? {});
  return (parsed.success ? parsed.data : getQuery(req)) as ListAiMessageQuery;
}

// POST /ai/chat
export async function chat(req: Request, res: Response): Promise<Response> {
  const body = getBody<AiChatInput>(req);
  const parsed = aiChatSchema.safeParse(body);
  const input = (parsed.success ? parsed.data : body) as AiChatInput;

  const data = await aiService.chat(getUserId(req), input, isStaffRequest(req));
  return sendSuccess(res, data);
}

// GET /ai/conversations
export async function listConversations(req: Request, res: Response): Promise<Response> {
  const result = await aiService.listConversations(getUserId(req), parseConversationQuery(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /ai/conversations/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ id: string }>(req);
  const data = await aiService.getConversation(params.id, getUserId(req));
  return sendSuccess(res, data);
}

// GET /ai/conversations/:id/messages
export async function listMessages(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ id: string }>(req);
  const result = await aiService.listMessages(
    params.id,
    getUserId(req),
    parseMessageQuery(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /ai/conversations/:id/close
export async function close(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ id: string }>(req);
  const data = await aiService.closeConversation(params.id, getUserId(req));
  return sendSuccess(res, data);
}
