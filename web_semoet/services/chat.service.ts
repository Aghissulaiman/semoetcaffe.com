/** Endpoint /chat/conversations — percakapan customer dengan tim support. */
import { api, request } from './client';

import type {
  ChatConversation,
  ChatMessage,
  CreateConversationPayload,
  Paginated,
} from '@/types/api';

export interface ListMyConversationsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export async function listMyConversations(
  params: ListMyConversationsParams = {},
): Promise<Paginated<ChatConversation>> {
  const res = await request<ChatConversation[]>('/chat/conversations/mine', {
    query: { limit: 50, ...params },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function createConversation(
  payload: CreateConversationPayload,
): Promise<ChatConversation> {
  return api<ChatConversation>('/chat/conversations', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function getConversation(id: string): Promise<ChatConversation> {
  return api<ChatConversation>(`/chat/conversations/${id}`, { auth: true });
}

export interface ListMessagesParams {
  page?: number;
  limit?: number;
  after?: string;
}

export async function listMessages(
  conversationId: string,
  params: ListMessagesParams = {},
): Promise<Paginated<ChatMessage>> {
  const res = await request<ChatMessage[]>(
    `/chat/conversations/${conversationId}/messages`,
    {
      query: { limit: 100, ...params },
      auth: true,
    },
  );
  return { items: res.data, meta: res.meta };
}

export function sendMessage(conversationId: string, body: string): Promise<ChatMessage> {
  return api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { body },
    auth: true,
  });
}
