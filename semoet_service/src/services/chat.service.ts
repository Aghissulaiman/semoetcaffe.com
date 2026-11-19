import { withTransaction } from '../config/database.js';
import { type ChatSenderType, type ChatStatus } from '../config/constants.js';
import { forbidden, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as chatRepo from '../repositories/chat.repository.js';
import { sendPush } from '../utils/notifier.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import type {
  CreateConversationInput,
  ListConversationQuery,
  ListMessageQuery,
  SendMessageInput,
  UpdateConversationInput,
} from '../validators/chat.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Konteks audit request untuk aktivitas staff di percakapan. */
export interface ChatAuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

/** Pengirim pesan yang dipakai endpoint ini. */
const SENDER_CUSTOMER: ChatSenderType = 'customer';
const SENDER_STAFF: ChatSenderType = 'staff';

/** Status percakapan yang sudah selesai; customer tidak boleh menambah pesan baru. */
const CONVERSATION_CLOSED: ChatStatus[] = ['resolved', 'closed'];

/** Panjang maksimum pratinjau pesan terakhir pada daftar antrean. */
const PREVIEW_LENGTH = 140;

/** Panjang teks notifikasi push. */
const NOTIFY_LENGTH = 120;

/** Ringkasan antrean untuk layar support staff. */
export interface ChatQueueSummary {
  open: number;
  waiting: number;
  unassigned: number;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeConversation(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    userId: str(row.userId),
    userName: strOrNull(row.userName),
    assignedStaffId: strOrNull(row.assignedStaffId),
    assignedStaffName: strOrNull(row.staffName),
    topic: str(row.topic),
    category: str(row.category ?? 'general'),
    status: str(row.status),
    lastMessagePreview: preview(strOrNull(row.lastMessage)),
    lastMessageAt: iso(row.lastMessageAt),
    messageCount: num(row.messageCount),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeMessage(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    conversationId: str(row.conversationId),
    senderType: str(row.senderType),
    senderUserId: strOrNull(row.senderUserId),
    senderName: strOrNull(row.senderName),
    body: str(row.body),
    attachmentStorageKey: strOrNull(row.attachmentStorageKey),
    deliveredAt: iso(row.deliveredAt),
    readAt: iso(row.readAt),
    createdAt: iso(row.createdAt),
  };
}

/** Pratinjau pesan dipotong supaya daftar antrean tetap ringkas. */
function preview(body: string | null): string | null {
  if (!body) return null;
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_LENGTH) return flat;
  return `${flat.slice(0, PREVIEW_LENGTH)}...`;
}

function notifyBody(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= NOTIFY_LENGTH ? flat : `${flat.slice(0, NOTIFY_LENGTH)}...`;
}

/**
 * Deteksi awal kategori percakapan dari topik/pesan pembuka. Admin tetap bisa
 * mengubah kategori secara manual lewat panel, ini hanya pintu masuk otomatis
 * supaya keluhan langsung masuk filter "Keluhan".
 */
function detectCategory(topic: string, initialMessage?: string): 'general' | 'complaint' {
  const haystack = `${topic} ${initialMessage ?? ''}`.toLowerCase();
  const complaintKeywords = [
    'keluhan',
    'komplain',
    'complain',
    'masalah',
    'rusak',
    'salah',
    'kecewa',
    'refund',
    'pengembalian',
    'terlambat',
    'telat',
    'tidak sesuai',
    'belum diterima',
    'hilang',
    'basi',
  ];
  return complaintKeywords.some((keyword) => haystack.includes(keyword)) ? 'complaint' : 'general';
}

/**
 * Percakapan hanya boleh dibuka oleh pemiliknya (customer) atau staff.
 * Percakapan milik orang lain disamakan jadi forbidden, bukan 404, karena
 * Staff memang butuh melihat seluruh antrean.
 */
function assertConversationAccess(
  conversation: Record<string, unknown>,
  userId: string,
  isStaff: boolean,
): void {
  if (isStaff) return;
  if (str(conversation.userId) !== userId) {
    throw forbidden('Anda tidak memiliki akses ke percakapan ini');
  }
}

// --------------------------------------------------------------------------
// GET /chat/conversations
// --------------------------------------------------------------------------
export async function listConversations(
  query: ListConversationQuery,
  userId: string,
  isStaff: boolean,
): Promise<Paginated<ReturnType<typeof shapeConversation>> & { queue: ChatQueueSummary }> {
  const paging = parsePagination(query);

  // Staff melihat seluruh antrean; customer (kalau endpoint ini dijangkau tanpa
  // requireStaff) hanya melihat percakapannya sendiri.
  const filters: chatRepo.ListConversationFilters = {
    status: query.status,
    unassigned: query.unassigned ?? false,
    userId: isStaff ? undefined : userId,
  };

  const rows = await chatRepo.listConversations(filters, paging);
  const total = await chatRepo.countConversations(filters);

  const [openCount, waitingCount, unassignedCount] = await Promise.all([
    chatRepo.countConversations({ status: 'open' }),
    chatRepo.countConversations({ status: 'waiting' }),
    chatRepo.countUnassignedConversations(),
  ]);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return {
    items: rows.map(shapeConversation),
    meta: buildPaginationMeta(pagination),
    queue: { open: openCount, waiting: waitingCount, unassigned: unassignedCount },
  };
}

// --------------------------------------------------------------------------
// POST /chat/conversations
// --------------------------------------------------------------------------
export async function createConversation(userId: string, input: CreateConversationInput) {
  const created = await withTransaction(async (tx) => {
    // Percakapan yang masih open/waiting dipakai lagi supaya riwayat customer
    // tidak terpecah jadi banyak thread.
    const existing = await chatRepo.findOpenConversationForUser(userId, tx);
    if (existing) {
      const conversationId = str(existing.id);
      if (input.initialMessage) {
        await chatRepo.insertMessage(
          {
            conversationId,
            senderType: SENDER_CUSTOMER,
            senderUserId: userId,
            body: input.initialMessage,
          },
          tx,
        );
        await chatRepo.syncConversationStatus(conversationId, SENDER_CUSTOMER, tx);
      }
      const refreshed = await chatRepo.findConversationById(conversationId, tx);
      return { conversation: refreshed ?? existing, reused: true };
    }

    // Auto-assign ke staff dengan beban percakapan aktif paling sedikit.
    const staff = await chatRepo.findLeastLoadedStaff(tx);
    const inserted = await chatRepo.insertConversation(
      {
        userId,
        topic: input.topic,
        category: input.category ?? detectCategory(input.topic, input.initialMessage),
        assignedStaffId: staff ? strOrNull(staff.id) : null,
      },
      tx,
    );
    if (!inserted) throw unprocessable('Percakapan gagal dibuat, silakan coba lagi');

    const conversationId = str(inserted.id);
    if (input.initialMessage) {
      await chatRepo.insertMessage(
        {
          conversationId,
          senderType: SENDER_CUSTOMER,
          senderUserId: userId,
          body: input.initialMessage,
        },
        tx,
      );
    }

    const refreshed = await chatRepo.findConversationById(conversationId, tx);
    return { conversation: refreshed ?? inserted, reused: false };
  });

  const conversation = created.conversation as unknown as Record<string, unknown>;

  // Notifikasi dikirim setelah COMMIT supaya staff tidak melihat percakapan
  // yang belum benar-benar tersimpan.
  const assignedStaffId = strOrNull(conversation.assignedStaffId);
  if (assignedStaffId) {
    await sendPush({
      userId: assignedStaffId,
      title: 'Percakapan baru',
      body: `Percakapan baru masuk: ${preview(str(conversation.topic)) ?? 'tanpa topik'}`,
    });
  }

  return { ...shapeConversation(conversation), reused: created.reused };
}

// --------------------------------------------------------------------------
// GET /chat/conversations/:id
// --------------------------------------------------------------------------
export async function getConversation(conversationId: string, userId: string, isStaff: boolean) {
  const conversation = await chatRepo.findConversationById(conversationId);
  if (!conversation) throw notFound('Percakapan', conversationId);

  assertConversationAccess(conversation, userId, isStaff);

  // Pratinjau pesan diambil terpisah karena select detail tidak memakai join.
  const lastMessage = await chatRepo.findLastMessage(conversationId);
  const shaped = shapeConversation(conversation);

  return {
    ...shaped,
    lastMessagePreview: lastMessage ? preview(strOrNull(lastMessage.body)) : shaped.lastMessagePreview,
    lastMessageAt: lastMessage ? iso(lastMessage.createdAt) : shaped.lastMessageAt,
  };
}

// --------------------------------------------------------------------------
// PATCH /chat/conversations/:id
// --------------------------------------------------------------------------
export async function updateConversation(
  conversationId: string,
  input: UpdateConversationInput,
  isStaff: boolean,
  actorUserId: string,
  audit: ChatAuditContext = {},
) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat mengubah status percakapan');

  return withTransaction(async (tx) => {
    const current = await chatRepo.lockConversation(conversationId, tx);
    if (!current) throw notFound('Percakapan', conversationId);

    // updateConversation menyusun SET dari nama kolom, jadi payload memakai
    // nama kolom database (snake_case).
    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.category !== undefined) data.category = input.category;
    if (input.assignedStaffId !== undefined) data.assigned_staff_id = input.assignedStaffId;

    const updated = await chatRepo.updateConversation(conversationId, data, tx);
    const shaped = shapeConversation((updated ?? current) as unknown as Record<string, unknown>);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'chat.conversation.update',
        entityType: 'conversation',
        entityId: conversationId,
        oldData: {
          status: str(current.status),
          category: str(current.category ?? 'general'),
          assignedStaffId: strOrNull(current.assignedStaffId),
        },
        newData: {
          status: shaped.status,
          category: shaped.category,
          assignedStaffId: shaped.assignedStaffId,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shaped;
  });
}

// --------------------------------------------------------------------------
// GET /chat/conversations/:id/messages
// --------------------------------------------------------------------------
export async function listMessages(
  conversationId: string,
  query: ListMessageQuery,
  userId: string,
  isStaff: boolean,
): Promise<Paginated<ReturnType<typeof shapeMessage>>> {
  const conversation = await chatRepo.findConversationById(conversationId);
  if (!conversation) throw notFound('Percakapan', conversationId);

  assertConversationAccess(conversation, userId, isStaff);

  // Buka thread = pesan dari pihak lawan sudah terkirim dan dibaca.
  await chatRepo.markMessagesRead(conversationId, isStaff ? 'customer' : 'staff');

  const paging = parsePagination(query);
  const rows = await chatRepo.listMessages(conversationId, paging, query.after);
  const total = await chatRepo.countMessages(conversationId);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeMessage), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /chat/conversations/:id/messages
// --------------------------------------------------------------------------
export async function sendMessage(
  conversationId: string,
  input: SendMessageInput,
  userId: string,
  isStaff: boolean,
) {
  const senderType: ChatSenderType = isStaff ? SENDER_STAFF : SENDER_CUSTOMER;

  const sent = await withTransaction(async (tx) => {
    const conversation = await chatRepo.lockConversation(conversationId, tx);
    if (!conversation) throw notFound('Percakapan', conversationId);

    assertConversationAccess(conversation, userId, isStaff);

    const currentStatus = str(conversation.status) as ChatStatus;
    if (!isStaff && CONVERSATION_CLOSED.includes(currentStatus)) {
      throw unprocessable('Percakapan ini sudah ditutup, silakan mulai percakapan baru');
    }

    const message = await chatRepo.insertMessage(
      {
        conversationId,
        senderType,
        senderUserId: userId,
        body: input.body,
        attachmentStorageKey: input.attachmentStorageKey ?? null,
      },
      tx,
    );
    if (!message) throw unprocessable('Pesan gagal dikirim, silakan coba lagi');

    // Penyegaran status (customer -> waiting, staff -> open) sekaligus
    // menyentuh updated_at yang dipakai untuk mengurutkan antrean, jadi keduanya
    // cukup satu repository call di dalam transaksi yang sama.
    const synced = await chatRepo.syncConversationStatus(conversationId, senderType, tx);

    // Pesan pelanggan yang mengandung indikasi keluhan otomatis masuk filter
    // "Keluhan". Admin tetap bisa mengubah kategori manual lewat panel.
    const nextCategory =
      !isStaff && detectCategory(str(conversation.topic), input.body) === 'complaint'
        ? 'complaint'
        : str(conversation.category ?? 'general');
    const previousCategory = str(conversation.category ?? 'general');
    if (nextCategory !== previousCategory) {
      await chatRepo.updateConversation(conversationId, { category: nextCategory }, tx);
      await adminRepo.insertAuditLog(
        {
          actorUserId: userId,
          action: 'chat.conversation.category',
          entityType: 'conversation',
          entityId: conversationId,
          oldData: { category: previousCategory },
          newData: { category: nextCategory },
          requestId: null,
          ipAddress: null,
        },
        tx,
      );
    }

    return {
      message,
      recipientId: isStaff
        ? strOrNull(conversation.userId)
        : strOrNull(conversation.assignedStaffId),
    };
  });

  const recipientId = sent.recipientId;
  if (recipientId) {
    await sendPush({
      userId: recipientId,
      title: isStaff ? 'Balasan tim support' : 'Pesan baru dari customer',
      body: notifyBody(input.body),
    });
  }

  return shapeMessage(sent.message as unknown as Record<string, unknown>);
}

// --------------------------------------------------------------------------
// POST /admin/chat/conversations/:id/assign
// --------------------------------------------------------------------------
export interface AssignConversationRequest {
  assignedStaffId?: string | null;
}

export async function assignStaff(
  conversationId: string,
  input: AssignConversationRequest,
  isStaff: boolean,
  actorUserId: string,
  audit: ChatAuditContext = {},
) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat menugaskan percakapan');

  return withTransaction(async (tx) => {
    const current = await chatRepo.lockConversation(conversationId, tx);
    if (!current) throw notFound('Percakapan', conversationId);

    // Tanpa assignedStaffId, pilih staff dengan beban aktif paling sedikit.
    let staffId = input.assignedStaffId ?? null;
    if (!staffId) {
      const staff = await chatRepo.findLeastLoadedStaff(tx);
      if (!staff) {
        throw unprocessable('Belum ada staff yang bisa menangani percakapan ini');
      }
      staffId = str(staff.id);
    }

    const previousStaffId = strOrNull(current.assignedStaffId);
    const updated = await chatRepo.updateConversation(
      conversationId,
      { assigned_staff_id: staffId },
      tx,
    );

    const shaped = shapeConversation((updated ?? current) as unknown as Record<string, unknown>);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'chat.conversation.assign',
        entityType: 'conversation',
        entityId: conversationId,
        oldData: { assignedStaffId: previousStaffId },
        newData: { assignedStaffId: staffId },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { ...shaped, previousStaffId };
  });
}
