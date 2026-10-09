import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const CONVERSATION_COLUMNS = `
  ac.id, ac.user_id, ac.purpose, ac.status, ac.created_at, ac.closed_at
`;

export async function findConversationById(conversationId: string, executor: Exec = db) {
  return one(executor, `SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations WHERE id = $1`, [
    conversationId,
  ]);
}

export async function insertConversation(
  input: { userId: string | null; purpose: string },
  executor: Exec,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO ai_conversations (user_id, purpose, status) VALUES ($1,$2,'open') RETURNING ${CONVERSATION_COLUMNS}`,
    [input.userId, input.purpose],
  );
}

export async function insertMessage(
  input: { conversationId: string; role: string; content: string },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1,$2,$3) RETURNING id, role, content, created_at`,
    [input.conversationId, input.role, input.content],
  );
}

export async function listMessages(conversationId: string, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, conversation_id, role, content, created_at
       FROM ai_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      ${paginationSql(pagination)}`,
    [conversationId],
  );
}

export async function countMessages(conversationId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM ai_messages WHERE conversation_id = $1`,
    [conversationId],
  );
  return Number(value ?? 0);
}

export async function listConversations(
  filters: { userId?: string | null; purpose?: string; status?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many<{
    messageCount: number;
    lastMessage: string | null;
    lastMessageAt: string | null;
  }>(
    executor,
    `SELECT ${CONVERSATION_COLUMNS},
            u.display_name AS user_name,
            (SELECT COUNT(*)::int FROM ai_messages m WHERE m.conversation_id = ac.id) AS message_count,
            (SELECT m.content FROM ai_messages m WHERE m.conversation_id = ac.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT m.created_at FROM ai_messages m WHERE m.conversation_id = ac.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM ai_conversations ac
       LEFT JOIN users u ON u.id = ac.user_id
      WHERE ($1::uuid IS NULL OR ac.user_id = $1)
        AND ($2::text IS NULL OR ac.purpose = $2)
        AND ($3::text IS NULL OR ac.status = $3)
      ORDER BY COALESCE((SELECT MAX(m2.created_at) FROM ai_messages m2 WHERE m2.conversation_id = ac.id), ac.created_at) DESC
      ${paginationSql(pagination)}`,
    [filters.userId ?? null, filters.purpose ?? null, filters.status ?? null],
  );
}

export async function countConversations(
  filters: { userId?: string | null; purpose?: string; status?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM ai_conversations
      WHERE ($1::uuid IS NULL OR user_id = $1)
        AND ($2::text IS NULL OR purpose = $2)
        AND ($3::text IS NULL OR status = $3)`,
    [filters.userId ?? null, filters.purpose ?? null, filters.status ?? null],
  );
  return Number(value ?? 0);
}

export async function closeConversation(conversationId: string, userId: string | null, executor: Exec = db) {
  return one(
    executor,
    `UPDATE ai_conversations
        SET status = 'closed', closed_at = now()
      WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2)
      RETURNING ${CONVERSATION_COLUMNS}`,
    [conversationId, userId],
  );
}

/** Lock percakapan saat menulis pesan supaya urutan & status konsisten. */
export async function lockConversation(conversationId: string, executor: Exec) {
  return one(executor, `SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations WHERE id = $1 FOR UPDATE`, [
    conversationId,
  ]);
}

export async function insertQueryLog(
  input: {
    conversationId?: string | null;
    adminUserId?: string | null;
    modelName: string;
    promptTokens?: number | null;
    completionTokens?: number | null;
    latencyMs?: number | null;
    outcome: string;
  },
  executor: Exec = db,
) {
  await executor.query(
    `INSERT INTO ai_query_logs (
        conversation_id, admin_user_id, model_name,
        prompt_tokens, completion_tokens, latency_ms, outcome
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.conversationId ?? null,
      input.adminUserId ?? null,
      input.modelName,
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      input.latencyMs ?? null,
      input.outcome,
    ],
  );
}

export async function listQueryLogs(
  filters: { outcome?: string; conversationId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT aql.id, aql.conversation_id, aql.admin_user_id, aql.model_name,
            aql.prompt_tokens, aql.completion_tokens, aql.latency_ms, aql.outcome, aql.created_at,
            u.display_name AS admin_name
       FROM ai_query_logs aql
       LEFT JOIN users u ON u.id = aql.admin_user_id
      WHERE ($1::text IS NULL OR aql.outcome = $1)
        AND ($2::uuid IS NULL OR aql.conversation_id = $2)
      ORDER BY aql.created_at DESC
      ${paginationSql(pagination)}`,
    [filters.outcome ?? null, filters.conversationId ?? null],
  );
}

export async function countQueryLogs(
  filters: { outcome?: string; conversationId?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM ai_query_logs
      WHERE ($1::text IS NULL OR outcome = $1)
        AND ($2::uuid IS NULL OR conversation_id = $2)`,
    [filters.outcome ?? null, filters.conversationId ?? null],
  );
  return Number(value ?? 0);
}