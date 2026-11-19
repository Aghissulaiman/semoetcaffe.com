import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const CONVERSATION_COLUMNS = `
  cc.id, cc.user_id, cc.assigned_staff_id, cc.topic, cc.category, cc.status, cc.created_at, cc.updated_at
`;

/**
 * Kolom yang sama tanpa prefix alias. Dipakai query satu tabel yang tidak
 * memakai alias `cc` (mis. `FROM chat_conversations` atau `RETURNING`).
 */
const CONVERSATION_COLUMNS_BARE = `
  id, user_id, assigned_staff_id, topic, category, status, created_at, updated_at
`;

export async function findOpenConversationForUser(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${CONVERSATION_COLUMNS_BARE}
       FROM chat_conversations
      WHERE user_id = $1 AND status IN ('open','waiting')
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId],
  );
}

export async function insertConversation(
  input: { userId: string; topic: string; category?: string; assignedStaffId?: string | null },
  executor: Exec,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO chat_conversations (user_id, topic, category, assigned_staff_id, status)
     VALUES ($1,$2,$3,$4,'open')
     RETURNING ${CONVERSATION_COLUMNS_BARE}`,
    [input.userId, input.topic, input.category ?? 'general', input.assignedStaffId ?? null],
  );
}

export async function findConversationById(conversationId: string, executor: Exec = db) {
  return one(executor, `SELECT ${CONVERSATION_COLUMNS_BARE} FROM chat_conversations WHERE id = $1`, [
    conversationId,
  ]);
}

export async function lockConversation(conversationId: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${CONVERSATION_COLUMNS_BARE} FROM chat_conversations WHERE id = $1 FOR UPDATE`,
    [conversationId],
  );
}

export interface ListConversationFilters {
  status?: string;
  unassigned?: boolean;
  /** Batasi ke percakapan milik user ini (customer) atau semua (staff). */
  userId?: string;
}

export async function listConversations(
  filters: ListConversationFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${CONVERSATION_COLUMNS},
            u.display_name AS user_name, u.email AS user_email,
            s.display_name AS staff_name,
            msgs.last_message, msgs.last_message_at, msgs.message_count
       FROM chat_conversations cc
       JOIN users u ON u.id = cc.user_id
       LEFT JOIN users s ON s.id = cc.assigned_staff_id
       LEFT JOIN LATERAL (
         SELECT
           (SELECT body FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
           (SELECT COUNT(*)::int FROM chat_messages WHERE conversation_id = cc.id) AS message_count
       ) msgs ON true
      WHERE ($1::uuid IS NULL OR cc.user_id = $1)
        AND ($2::text IS NULL OR cc.status = $2)
        AND ($3::boolean = false OR cc.assigned_staff_id IS NULL)
      ORDER BY COALESCE(msgs.last_message_at, cc.updated_at) DESC
      ${paginationSql(pagination)}`,
    [filters.userId ?? null, filters.status ?? null, filters.unassigned ?? false],
  );
}

export async function countConversations(filters: ListConversationFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM chat_conversations cc
      WHERE ($1::uuid IS NULL OR cc.user_id = $1)
        AND ($2::text IS NULL OR cc.status = $2)
        AND ($3::boolean = false OR cc.assigned_staff_id IS NULL)`,
    [filters.userId ?? null, filters.status ?? null, filters.unassigned ?? false],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Admin: list all conversations with filters
// --------------------------------------------------------------------------
export interface ListAdminConversationFilters {
  status?: string;
  category?: string;
  assignedStaffId?: string;
  q?: string;
}

export async function listAdminConversations(
  filters: ListAdminConversationFilters,
  pagination: { page: number; limit: number; offset: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${CONVERSATION_COLUMNS},
            u.display_name AS user_name, u.email AS user_email, u.phone_e164 AS user_phone,
            s.display_name AS staff_name, s.email AS staff_email,
            msgs.last_message, msgs.last_message_at, msgs.message_count
       FROM chat_conversations cc
       JOIN users u ON u.id = cc.user_id
       LEFT JOIN users s ON s.id = cc.assigned_staff_id
       LEFT JOIN LATERAL (
         SELECT
           (SELECT body FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
           (SELECT COUNT(*)::int FROM chat_messages WHERE conversation_id = cc.id) AS message_count
     ) msgs ON true
      WHERE ($1::text IS NULL OR cc.status = $1)
        AND ($2::uuid IS NULL OR cc.assigned_staff_id = $2)
        AND ($3::text IS NULL OR u.display_name ILIKE '%' || $3 || '%'
                              OR u.email ILIKE '%' || $3 || '%'
                              OR u.phone_e164 ILIKE '%' || $3 || '%'
                              OR s.display_name ILIKE '%' || $3 || '%'
                              OR cc.topic ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR cc.category = $4)
      ORDER BY COALESCE(msgs.last_message_at, cc.updated_at) DESC
      ${paginationSql(pagination)}`,
    [filters.status ?? null, filters.assignedStaffId ?? null, filters.q ?? null, filters.category ?? null],
  );
}

export async function countAdminConversations(filters: ListAdminConversationFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM chat_conversations cc
       JOIN users u ON u.id = cc.user_id
       LEFT JOIN users s ON s.id = cc.assigned_staff_id
      WHERE ($1::text IS NULL OR cc.status = $1)
        AND ($2::uuid IS NULL OR cc.assigned_staff_id = $2)
        AND ($3::text IS NULL OR u.display_name ILIKE '%' || $3 || '%'
                              OR u.email ILIKE '%' || $3 || '%'
                              OR u.phone_e164 ILIKE '%' || $3 || '%'
                              OR s.display_name ILIKE '%' || $3 || '%'
                              OR cc.topic ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR cc.category = $4)`,
    [filters.status ?? null, filters.assignedStaffId ?? null, filters.q ?? null, filters.category ?? null],
  );
  return Number(value ?? 0);
}

export async function updateConversation(
  conversationId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE chat_conversations cc SET ${assignments}, updated_at = now() WHERE cc.id = $1 RETURNING ${CONVERSATION_COLUMNS}`,
    [conversationId, ...Object.values(data)],
  );
}

/** Staff yang akan.handle percakapan masuk: staff dengan beban paling sedikit. */
export async function findLeastLoadedStaff(executor: Exec = db) {
  return one<{ id: string; displayName: string; openConversations: number }>(
    executor,
    `SELECT u.id, u.display_name, COUNT(cc.id)::int AS open_conversations
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.code IN ('staff','branch_manager')
       LEFT JOIN chat_conversations cc ON cc.assigned_staff_id = u.id AND cc.status IN ('open','waiting')
      WHERE u.status = 'active' AND u.deleted_at IS NULL
      GROUP BY u.id, u.display_name
      ORDER BY COUNT(cc.id) ASC, u.display_name ASC
      LIMIT 1`,
  );
}

export async function countUnassignedConversations(executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM chat_conversations WHERE assigned_staff_id IS NULL AND status = 'open'`,
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Messages (chat_messages)
// --------------------------------------------------------------------------
export async function insertMessage(
  input: {
    conversationId: string;
    senderType: string;
    senderUserId?: string | null;
    body: string;
    attachmentStorageKey?: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO chat_messages (conversation_id, sender_type, sender_user_id, body, attachment_storage_key)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, conversation_id, sender_type, sender_user_id, body, attachment_storage_key,
               delivered_at, read_at, created_at`,
    [
      input.conversationId,
      input.senderType,
      input.senderUserId ?? null,
      input.body,
      input.attachmentStorageKey ?? null,
    ],
  );
}

export async function listMessages(conversationId: string, pagination: Paging, after?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT cm.id, cm.conversation_id, cm.sender_type, cm.sender_user_id, cm.body,
            cm.attachment_storage_key, cm.delivered_at, cm.read_at, cm.created_at,
            u.display_name AS sender_name
       FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.sender_user_id
      WHERE cm.conversation_id = $1
        AND ($2::timestamptz IS NULL OR cm.created_at > $2::timestamptz)
      ORDER BY cm.created_at ASC
      ${paginationSql(pagination)}`,
    [conversationId, after ?? null],
  );
}

/**
 * Tandai pesan dari pihak lawan sebagai terkirim + dibaca. Dipanggil saat
 * salah satu pihak membuka thread, sehingga status di pengirim berubah dari
 * "Terkirim" menjadi "Dibaca" begitu penerima benar-benar memuat pesannya.
 */
export async function markMessagesRead(
  conversationId: string,
  senderType: 'customer' | 'staff',
  executor: Exec = db,
) {
  return many(
    executor,
    `UPDATE chat_messages
        SET delivered_at = COALESCE(delivered_at, now()),
            read_at = COALESCE(read_at, now())
      WHERE conversation_id = $1
        AND sender_type = $2
        AND read_at IS NULL
      RETURNING id`,
    [conversationId, senderType],
  );
}

export async function countMessages(conversationId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM chat_messages WHERE conversation_id = $1`,
    [conversationId],
  );
  return Number(value ?? 0);
}

export async function findLastMessage(conversationId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, sender_type, sender_user_id, body, created_at
       FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [conversationId],
  );
}

/** Tandai percakapan "waiting" saat customer menulis, "open" saat staff membalas. */
export async function syncConversationStatus(
  conversationId: string,
  senderType: string,
  executor: Exec,
) {
  const nextStatus = senderType === 'customer' ? 'waiting' : 'open';
  return updateConversation(conversationId, { status: nextStatus }, executor);
}