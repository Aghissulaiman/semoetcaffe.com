import { withTransaction, type TransactionClient } from '../config/database.js';
import {
  AI_MESSAGE_ROLE,
  AI_PURPOSE,
  type AiMessageRole,
  type AiOutcome,
  type AiPurpose,
} from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  forbidden,
  notFound,
  ServiceUnavailableError,
  unprocessable,
} from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as aiRepo from '../repositories/ai.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as homeRepo from '../repositories/home.repository.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';
import * as orderRepo from '../repositories/order.repository.js';
import * as promoRepo from '../repositories/promo.repository.js';
import { formatIdr } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import type { AiChatInput, ListAiConversationQuery, ListAiMessageQuery } from '../validators/ai.validator.js';
import {
  CONTEXT_SECTION_MARKER,
  getAiProvider,
  type AiChatTurn,
  type AiProvider,
} from './ai.provider.js';

/**
 * Service asisten AI.
 *
 * Sifat penting: asisten ini HANYA membaca. Seluruh konteks jawaban diambil
 * lewat repository baca yang sudah ada (katalog, home, cabang, promo, order,
 * admin dashboard, inventori). Tidak ada SQL bebas, tidak ada repository tulis,
 * dan model tidak pernah menerima handle database apa pun.
 */

// --------------------------------------------------------------------------
// Batas kontekstual: menjaga prompt tetap kecil agar tidak mungkin membengkak
// --------------------------------------------------------------------------

/** Jumlah pesan terakhir (user + assistant) yang dikirim sebagai riwayat. */
const HISTORY_LIMIT = 8;

/** Jumlah karakter yang dialokasikan untuk baris catatan pemotongan konteks. */
const CONTEXT_NOTE_CHARS = 80;
const MAX_CONTEXT_CHARS = 16_000; // batas aman untuk prompt kontekstual

/** Jumlah pesan yang ikut pada response detail percakapan. */
const DETAIL_MESSAGE_LIMIT = 20;

const MENU_HIGHLIGHT_LIMIT = 8;
const BRANCH_LIMIT = 4;
const PROMO_LIMIT = 5;
const VOUCHER_LIMIT = 5;
const RECENT_ORDER_LIMIT = 5;
const SALES_DAYS_LIMIT = 7;
const TOP_PRODUCT_LIMIT = 5;
const LOW_STOCK_LIMIT = 8;

/** day_of_week 0 = Minggu, mengikuti kolom pada tabel branch_business_hours. */
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Nilai untuk kolom outcome pada ai_query_logs. */
const OUTCOME_SUCCESS: AiOutcome = 'success';
const OUTCOME_ERROR: AiOutcome = 'error';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

export interface AiConversationDto {
  id: string;
  purpose: string;
  status: string;
  userId: string | null;
  messageCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  closedAt: string | null;
}

export interface AiMessageDto {
  id: string;
  role: string;
  content: string;
  createdAt: string | null;
}

export interface AiChatResult {
  conversation: AiConversationDto;
  created: boolean;
  userMessage: AiMessageDto;
  reply: AiMessageDto;
  provider: string;
  model: string;
  fallback: boolean;
  usage: { promptTokens: number | null; completionTokens: number | null } | null;
  context: { characters: number; truncated: boolean; sections: string[] };
}

// --------------------------------------------------------------------------
// Shaping DTO
// --------------------------------------------------------------------------

function shapeConversation(
  row: Record<string, unknown>,
  extras: { messageCount?: number; lastMessage?: unknown; lastMessageAt?: unknown } = {},
): AiConversationDto {
  return {
    id: str(row.id),
    purpose: str(row.purpose),
    status: str(row.status),
    userId: strOrNull(row.userId),
    messageCount: num(extras.messageCount),
    lastMessage: extras.lastMessage === undefined ? null : strOrNull(extras.lastMessage),
    lastMessageAt: extras.lastMessageAt === undefined ? null : iso(extras.lastMessageAt),
    createdAt: iso(row.createdAt),
    closedAt: iso(row.closedAt),
  };
}

function shapeMessage(row: Record<string, unknown>): AiMessageDto {
  return {
    id: str(row.id),
    role: str(row.role),
    content: str(row.content),
    createdAt: iso(row.createdAt),
  };
}

// --------------------------------------------------------------------------
// Aturan akses
// --------------------------------------------------------------------------

function assertAssistantEnabled(): void {
  if (env.AI_ASSISTANT_ENABLED) return;
  throw new ServiceUnavailableError(
    'Asisten AI sedang dinonaktifkan sementara. Silakan hubungi kasir atau coba lagi nanti.',
  );
}

function assertPurposeAllowed(purpose: AiPurpose, isStaff: boolean): void {
  if (purpose !== 'admin_assistant') return;
  if (!isStaff) {
    throw forbidden('Asisten bisnis hanya dapat digunakan oleh staff atau pemilik usaha');
  }
}

function assertOwner(conversation: Record<string, unknown>, userId: string): void {
  const ownerId = strOrNull(conversation.userId);
  if (ownerId !== userId) {
    throw forbidden('Percakapan ini bukan milik Anda');
  }
}

function isClosed(conversation: Record<string, unknown>): boolean {
  return str(conversation.status) === 'closed';
}

// --------------------------------------------------------------------------
// System prompt per purpose
// --------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<AiPurpose, string> = {
  customer_support: [
    'Anda adalah asisten Semoet Cafe yang berbicara dalam bahasa Indonesia yang ramah, ringkas, dan natural.',
    'Tugas Anda menjawab pertanyaan pelanggan tentang menu dan harga, cabang dan jam buka, promo yang sedang berjalan, serta status pesanan pelanggan itu sendiri.',
    'Aturan:',
    '- Jawab hanya dari blok konteks data. Jika informasinya tidak ada, katakan data tersebut belum tersedia dan arahkan pelanggan ke kasir.',
    '- Jangan mengarang harga, promo, atau status pesanan.',
    '- Jangan mengeluarkan JSON atau kode apa pun; jawaban berupa kalimat biasa yang singkat.',
  ].join('\n'),
  admin_assistant: [
    'Anda adalah asisten bisnis untuk pemilik dan staff Semoet Cafe, berbahasa Indonesia yang ringkas dan berorientasi angka.',
    'Tugas Anda menjawab pertanyaan bisnis: penjualan dan omzet, produk terlaris, komposisi pesanan, serta kondisi stok bahan.',
    'Aturan:',
    '- Jawab hanya dari blok konteks data dan tuliskan angka dalam rupiah.',
    '- Bila angka tidak ada, katakan datanya belum tersedia; jangan menebak.',
    '- Jangan menyebut data pelanggan pribadi (nama, telepon, alamat) meski ada di konteks.',
    '- Balasan maksimal satu paragraf pendek plus maksimal tiga butir temuan.',
  ].join('\n'),
};

function systemPromptFor(purpose: AiPurpose): string {
  return SYSTEM_PROMPTS[purpose];
}

// --------------------------------------------------------------------------
// Konteks data berbatas
// --------------------------------------------------------------------------

interface ContextSection {
  title: string;
  lines: string[];
}

interface ContextInput {
  purpose: AiPurpose;
  userId: string;
  context: NonNullable<AiChatInput['context']>;
  now: Date;
}

/**
 * Satu bagian konteks dibungkus try/catch: bila satu repository baca bermasalah
 * tetap ada jawaban, hanya bagian itu yang dikosongkan.
 */
async function safeSection(
  title: string,
  loader: () => Promise<string[]>,
): Promise<ContextSection> {
  try {
    const lines = await loader();
    return { title, lines: lines.length > 0 ? lines : ['Data belum tersedia saat ini.'] };
  } catch (error) {
    logger.warn(
      { title, reason: error instanceof Error ? error.message : 'error tidak diketahui' },
      '[ai] gagal memuat bagian konteks, dilewati',
    );
    return { title, lines: ['Data bagian ini belum berhasil dimuat.'] };
  }
}

/**
 * Satu baris produk. Awalan "- " ditambahkan oleh renderContext, jadi di sini
 * cukup teksnya saja.
 */
function productLine(row: Record<string, unknown>): string {
  const name = str(row.name);
  const category = strOrNull(row.categoryName);
  const minPrice = num(row.minPriceIdr, -1);
  const price = minPrice >= 0 ? `mulai ${formatIdr(minPrice)}` : 'hanya tersedia di aplikasi';
  return `${name}${category ? ` (${category})` : ''} - ${price}`;
}

async function menuLines(input: ContextInput): Promise<string[]> {
  const lines: string[] = [];
  const filters: catalogRepo.ProductFilters = {
    sort: 'featured',
    includeModifiers: false,
    includeImages: false,
    isFeatured: true,
    branchId: input.context.branchId,
  };

  const [featured, popular, catalog, categories] = await Promise.all([
    homeRepo.listFeaturedProducts({ at: input.now, limit: MENU_HIGHLIGHT_LIMIT }),
    homeRepo.listMostFavorited(4),
    catalogRepo.listProducts(filters, { limit: MENU_HIGHLIGHT_LIMIT, offset: 0 }),
    homeRepo.countProductsByCategory(),
  ]);

  if (featured.length > 0) {
    lines.push('Menu unggulan:');
    lines.push(...featured.map(productLine));
  }

  if (popular.length > 0) {
    lines.push('Paling banyak difavoritkan pelanggan:');
    lines.push(...popular.map(productLine));
  } else if (catalog.length > 0) {
    lines.push('Contoh menu aktif:');
    lines.push(...catalog.slice(0, 5).map(productLine));
  }

  const categoryNames = categories
    .slice(0, 6)
    .map((row) => `${str(row.categoryName)} (${num(row.productCount)} menu)`);
  if (categoryNames.length > 0) {
    lines.push(`Kategori tersedia: ${categoryNames.join(', ')}.`);
  }

  if (input.context.productId) {
    const [product, variants] = await Promise.all([
      catalogRepo.findProductById(input.context.productId),
      catalogRepo.listVariants(input.context.productId),
    ]);
    if (product) {
      lines.push(`Produk yang sedang ditanyakan: ${str(product.name)} - ${strOrNull(product.description) ?? 'tanpa deskripsi'}.`);
      lines.push(
        `Varian: ${
          variants
            .map((variant) => `${str(variant.name)} ${formatIdr(num(variant.priceIdr))}`)
            .join(', ') || 'belum ada varian aktif'
        }.`,
      );
    } else {
      lines.push('Produk yang dirujuk tidak ditemukan pada katalog.');
    }
  }

  return lines;
}

function dayName(value: unknown): string {
  const day = num(value, -1);
  return day >= 0 && day <= 6 ? DAY_NAMES[day] : 'hari tidak diketahui';
}

function clockTime(value: unknown): string {
  const raw = strOrNull(value);
  if (!raw) return 'tidak ditentukan';
  const time = raw.split('T')[1];
  return (time ?? raw).slice(0, 5);
}

async function branchLines(input: ContextInput): Promise<string[]> {
  const lines: string[] = [];
  const selected = input.context.branchId
    ? [await branchRepo.findBranchById(input.context.branchId)]
    : await branchRepo.listBranches({ limit: BRANCH_LIMIT, offset: 0 }, { isActive: true });

  const branches = selected.filter((row): row is Record<string, unknown> => row !== null);
  if (branches.length === 0) return lines;

  for (const branch of branches) {
    lines.push(
      `${str(branch.name)} (${str(branch.code)}) - ${str(branch.address)}, telepon ${str(branch.phone)}, zona waktu ${str(branch.timezone)}.`,
    );
  }

  const hours = await branchRepo.listBusinessHours(str(branches[0].id));
  if (hours.length > 0) {
    lines.push(`Jam buka ${str(branches[0].name)}:`);
    for (const row of hours.slice(0, 8)) {
      lines.push(
        `${dayName(row.dayOfWeek)} (${str(row.serviceType)}): ${clockTime(row.opensAt)} - ${clockTime(row.closesAt)}`,
      );
    }
  }

  return lines;
}

async function promoLines(input: ContextInput): Promise<string[]> {
  const lines: string[] = [];
  const [promos, vouchers] = await Promise.all([
    promoRepo.listPromos(
      { isActive: true, currentlyValid: true },
      { limit: PROMO_LIMIT, offset: 0 },
    ),
    promoRepo.listUserVouchers(input.userId, { limit: VOUCHER_LIMIT, offset: 0 }, 'available'),
  ]);

  for (const promo of promos) {
    lines.push(
      `Promo ${str(promo.name)} (kode ${str(promo.code)}) - ${str(promo.discountType)} `
        + `bernilai ${num(promo.discountValue)}, minimal belanja ${formatIdr(num(promo.minimumOrderIdr))}, `
        + `berlaku sampai ${strOrNull(promo.endsAt)?.slice(0, 10) ?? 'tidak ditentukan'}.`,
    );
  }

  for (const voucher of vouchers) {
    lines.push(
      `Voucher milik pelanggan: ${str(voucher.promoName)} (kode ${str(voucher.code)}), `
        + `kedaluwarsa ${strOrNull(voucher.expiresAt)?.slice(0, 10) ?? 'tidak ditentukan'}.`,
    );
  }

  return lines;
}

function orderLine(row: Record<string, unknown>): string {
  return (
    `Pesanan ${str(row.orderNumber)} di ${strOrNull(row.branchName) ?? 'cabang tanpa nama'} - `
    + `status ${str(row.orderStatus)}, pembayaran ${str(row.paymentStatus)}, `
    + `total ${formatIdr(num(row.totalIdr))}, dibuat ${iso(row.placedAt) ?? 'tidak diketahui'}.`
  );
}

async function customerOrderLines(input: ContextInput): Promise<string[]> {
  const lines: string[] = [];
  const orders = await orderRepo.listOrdersForUser(
    input.userId,
    { sort: 'newest' },
    { limit: RECENT_ORDER_LIMIT, offset: 0 },
  );
  if (orders.length > 0) {
    lines.push(...orders.map(orderLine));
  }

  if (input.context.orderId) {
    const order = await orderRepo.findOrderForUser(input.context.orderId, input.userId);
    if (!order) {
      lines.push('Pesanan yang dirujuk tidak ditemukan pada akun pelanggan ini.');
      return lines;
    }
    lines.push(`Detail pesanan ${str(order.orderNumber)}: ${orderLine(order)}.`);
    const items = await orderRepo.listOrderItems(input.context.orderId);
    for (const item of items.slice(0, 10)) {
      lines.push(
        `${str(item.productNameSnapshot)} ${strOrNull(item.variantNameSnapshot) ?? ''} x${num(item.quantity)} `
          + `= ${formatIdr(num(item.lineTotalIdr))} (${str(item.itemStatus)})`,
      );
    }
  }

  return lines;
}

async function salesSummaryLines(input: ContextInput): Promise<string[]> {
  const filters = { branchId: input.context.branchId };
  const [summary, snapshot, byStatus] = await Promise.all([
    adminRepo.salesSummary(filters),
    adminRepo.operationalSnapshot(),
    adminRepo.ordersByStatus(filters),
  ]);

  const lines = [
    `Total pesanan tercatat: ${num(summary?.totalOrders)}.`,
    `Total penjualan terbayar: ${formatIdr(num(summary?.totalPaidSalesIdr))}.`,
    `Rata-rata nilai pesanan: ${formatIdr(num(summary?.avgOrderValueIdr))}.`,
    `Hari aktif: ${num(summary?.activeDays)}.`,
    `Pesanan aktif hari ini: ${num(snapshot?.todayOrders)} `
      + `dengan omzet ${formatIdr(num(snapshot?.todayRevenueIdr))}.`,
  ];

  if (byStatus.length > 0) {
    lines.push(
      `Komposisi pesanan: ${byStatus.map((row) => `${str(row.orderStatus)} ${num(row.total)}`).join(', ')}.`,
    );
  }

  return lines;
}

async function dailySalesLines(input: ContextInput): Promise<string[]> {
  const rows = await adminRepo.dailySales(
    { branchId: input.context.branchId },
    { limit: SALES_DAYS_LIMIT, offset: 0 },
  );
  return rows.map(
    (row) =>
      `${iso(row.businessDate)?.slice(0, 10) ?? str(row.businessDate)}: `
      + `${num(row.orderCount)} pesanan, ${formatIdr(num(row.paidSalesIdr))}.`,
  );
}

async function topProductLines(input: ContextInput): Promise<string[]> {
  const rows = await adminRepo.topProducts({
    branchId: input.context.branchId,
    limit: TOP_PRODUCT_LIMIT,
  });
  return rows.map(
    (row) =>
      `${str(row.name)}: terjual ${num(row.totalQuantity)} pcs, `
      + `pendapatan ${formatIdr(num(row.totalRevenueIdr))}.`,
  );
}

async function lowStockLines(input: ContextInput): Promise<string[]> {
  const rows = await inventoryRepo.listIngredients(
    { isActive: true, lowStockOnly: true, branchId: input.context.branchId },
    { limit: LOW_STOCK_LIMIT, offset: 0 },
  );
  if (rows.length === 0) return ['Tidak ada bahan yang berada di bawah reorder level.'];
  return rows.map(
    (row) =>
      `${str(row.name)} (${str(row.sku)}): stok ${num(row.onHand)} ${str(row.baseUnit)}, `
      + `reorder level ${num(row.reorderLevel)}.`,
  );
}

async function catalogLines(input: ContextInput): Promise<string[]> {
  const filters: catalogRepo.ProductFilters = {
    sort: 'featured',
    includeModifiers: false,
    includeImages: false,
    branchId: input.context.branchId,
  };
  const [total, highlights] = await Promise.all([
    catalogRepo.countProducts(filters),
    catalogRepo.listProducts(filters, { limit: MENU_HIGHLIGHT_LIMIT, offset: 0 }),
  ]);

  return [`Total menu aktif: ${total} produk.`, ...highlights.map(productLine)];
}

async function buildContextSections(input: ContextInput): Promise<ContextSection[]> {
  if (input.purpose === 'admin_assistant') {
    return [
      await safeSection('Ringkasan penjualan', () => salesSummaryLines(input)),
      await safeSection('Penjualan 7 hari terakhir', () => dailySalesLines(input)),
      await safeSection('Produk terlaris', () => topProductLines(input)),
      await safeSection('Stok menipis', () => lowStockLines(input)),
      await safeSection('Katalog aktif', () => catalogLines(input)),
    ];
  }

  return [
    await safeSection('Menu dan rekomendasi', () => menuLines(input)),
    await safeSection('Cabang dan jam buka', () => branchLines(input)),
    await safeSection('Promo dan voucher', () => promoLines(input)),
    await safeSection('Pesanan terakhir pelanggan', () => customerOrderLines(input)),
  ];
}

interface RenderedContext {
  text: string;
  truncated: boolean;
  sections: string[];
}

/**
 * Render blok konteks dengan pagu karakter keras. Pagu diterapkan dua lapis:
 * satu bagian bisa dipotong per baris, dan bagian yang tidak muat sama sekali
 * dilewati. Ruang untuk blok "Catatan" selalu disisihkan lebih dulu, sehingga
 * panjang hasil render dijamin <= 6_000.
 */
function renderContext(sections: ContextSection[]): RenderedContext {
  const blocks: string[] = [];
  const kept: string[] = [];
  let used = 0;
  let truncated = false;

  const budget = 6_000 - CONTEXT_NOTE_CHARS;

  for (const section of sections) {
    const header = `## ${section.title}`;
    const remaining = budget - used - header.length - 2;
    if (remaining <= 0) {
      truncated = true;
      continue;
    }

    // Baris yang berakhir dengan titik dua adalah sub-judul, bukan butir.
    const format = (lines: string[]): string =>
      lines.map((line) => (line.endsWith(':') ? line : `- ${line}`)).join('\n');

    const rendered = format(section.lines);
    const isPartial = rendered.length > remaining;
    const body = isPartial ? format(section.lines.slice(0, 1)) : rendered;
    if (isPartial) truncated = true;

    blocks.push(`${header}\n${body}\n`);
    kept.push(section.title);
    used += header.length + body.length + 2;

    // Setelah satu bagian dipotong, sisa bagian di bawahnya tidak akan muat.
    if (isPartial) break;
  }

  if (blocks.length === 0) {
    return {
      text: 'Belum ada data konteks yang bisa dikirim ke model.',
      truncated: false,
      sections: [],
    };
  }

  if (truncated) {
    blocks.push('## Catatan\n- Sebagian data konteks dipotong karena batas panjang prompt.\n');
  }

  return { text: blocks.join('\n'), truncated, sections: kept };
}

async function buildBoundedContext(input: ContextInput): Promise<RenderedContext> {
  const sections = await buildContextSections(input);
  return renderContext(sections);
}

// --------------------------------------------------------------------------
// POST /ai/chat
// --------------------------------------------------------------------------

function toChatTurns(rows: Record<string, unknown>[]): AiChatTurn[] {
  const turns: AiChatTurn[] = [];
  for (const row of rows) {
    const role = str(row.role);
    if (!AI_MESSAGE_ROLE.includes(role as AiMessageRole)) continue;
    turns.push({ role: role as AiMessageRole, content: truncateMessage(str(row.content)) });
  }
  return turns;
}

/** Setiap pesan tetap dipotong agar riwayat panjang tidak membebani prompt. */
function truncateMessage(value: string): string {
  const max = 1_500;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export async function chat(userId: string, input: AiChatInput, isStaff: boolean): Promise<AiChatResult> {
  const purpose = (input.purpose ?? 'customer_support') as AiPurpose;
  assertPurposeAllowed(purpose, isStaff);
  assertAssistantEnabled();

  const provider: AiProvider = getAiProvider();
  const contextInput: ContextInput = {
    purpose,
    userId,
    context: input.context ?? {},
    now: new Date(),
  };

  // Diisi di dalam transaksi, dibaca setelah rollback untuk log kegagalan.
  let loggableConversationId: string | null = null;
  let failureLatencyMs: number | null = null;

  try {
    return await withTransaction(async (tx) => {
      const { conversation, created } = await resolveConversation(tx, userId, input, purpose);
      const conversationId = str(conversation.id);
      loggableConversationId = conversationId;

      // Percakapan yang dilanjutkan bisa saja dibuat saat pemanggil masih
      // punya peran staff, jadi guard staff diulang terhadap purpose efektif.
      const effectivePurpose = AI_PURPOSE.includes(str(conversation.purpose) as AiPurpose)
        ? (str(conversation.purpose) as AiPurpose)
        : purpose;
      assertPurposeAllowed(effectivePurpose, isStaff);

      const userMessage = await aiRepo.insertMessage(
        { conversationId, role: 'user', content: input.message },
        tx,
      );

      const history = await loadRecentMessages(tx, conversationId);
      const rendered = await buildBoundedContext({ ...contextInput, purpose: effectivePurpose });
      const systemPrompt = `${systemPromptFor(effectivePurpose)}\n\n${CONTEXT_SECTION_MARKER}\n${rendered.text}`;

      const startedAt = Date.now();
      let completion;
      try {
        completion = await provider.complete({
          purpose: effectivePurpose,
          systemPrompt,
          messages: toChatTurns(history),
          maxTokens: 700,
          temperature: 0.3,
        });
      } catch (error) {
        // Ditandai supaya log kegagalan tetap ditulis meski transaksi rollback.
        failureLatencyMs = Date.now() - startedAt;
        throw error;
      }

      const latencyMs = Date.now() - startedAt;
      const assistantMessage = await aiRepo.insertMessage(
        { conversationId, role: 'assistant', content: completion.text },
        tx,
      );

      await aiRepo.insertQueryLog(
        {
          conversationId,
          adminUserId: effectivePurpose === 'admin_assistant' ? userId : null,
          modelName: completion.model,
          promptTokens: completion.usage?.promptTokens ?? null,
          completionTokens: completion.usage?.completionTokens ?? null,
          latencyMs,
          outcome: OUTCOME_SUCCESS,
        },
        tx,
      );

      const refreshed = await aiRepo.findConversationById(conversationId, tx);

      return {
        conversation: shapeConversation(refreshed ?? conversation),
        created,
        userMessage: shapeMessage(userMessage ?? {}),
        reply: shapeMessage(assistantMessage ?? {}),
        provider: provider.name,
        model: completion.model,
        fallback: completion.isFallback,
        usage: completion.usage ?? null,
        context: {
          characters: rendered.text.length,
          truncated: rendered.truncated,
          sections: rendered.sections,
        },
      };
    });
  } catch (error) {
    if (failureLatencyMs !== null) {
      // Transaksi sudah rollback, jadi log ditulis di luar transaksi memakai
      // executor default. conversationId hanya diisi bila percakapan lama.
      await aiRepo
        .insertQueryLog({
          conversationId: loggableConversationId,
          adminUserId: purpose === 'admin_assistant' ? userId : null,
          modelName: env.AI_MODEL,
          latencyMs: failureLatencyMs,
          outcome: OUTCOME_ERROR,
        })
        .catch((logError: unknown) => {
          logger.error(
            { reason: logError instanceof Error ? logError.message : 'error tidak diketahui' },
            '[ai] gagal menulis log kegagalan query AI',
          );
        });
    }
    throw error;
  }
}

/**
 * Lock baris percakapan lebih dulu supaya dua request paralel tidak membuat
 * dua percakapan untuk pengguna yang sama, lalu cek kepemilikan.
 */
async function resolveConversation(
  tx: TransactionClient,
  userId: string,
  input: AiChatInput,
  purpose: AiPurpose,
): Promise<{ conversation: Record<string, unknown>; created: boolean }> {
  if (input.conversationId) {
    const existing = await aiRepo.lockConversation(input.conversationId, tx);
    if (!existing) throw notFound('Percakapan', input.conversationId);
    assertOwner(existing, userId);
    if (isClosed(existing)) {
      throw unprocessable(
        'Percakapan ini sudah ditutup. Mulai percakapan baru bila ingin bertanya lagi.',
      );
    }
    return { conversation: existing, created: false };
  }

  const created = await aiRepo.insertConversation({ userId, purpose }, tx);
  if (!created) throw unprocessable('Percakapan tidak dapat dibuat. Silakan coba lagi.');
  return { conversation: created, created: true };
}

/** Hanya mengambil pesan terakhir: riwayat panjang dipotong dari depan. */
async function loadRecentMessages(
  tx: TransactionClient,
  conversationId: string,
): Promise<Record<string, unknown>[]> {
  const total = await aiRepo.countMessages(conversationId, tx);
  const offset = Math.max(0, total - HISTORY_LIMIT);
  return aiRepo.listMessages(conversationId, { limit: HISTORY_LIMIT, offset }, tx);
}

// --------------------------------------------------------------------------
// GET /ai/conversations
// --------------------------------------------------------------------------

export async function listConversations(
  userId: string,
  query: ListAiConversationQuery,
): Promise<Paginated<AiConversationDto>> {
  const paging = parsePagination(query);
  const filters = { userId, purpose: query.purpose, status: query.status };

  const rows = await aiRepo.listConversations(filters, paging);
  const total = await aiRepo.countConversations(filters);
  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  const items = rows.map((row) =>
    shapeConversation(row, {
      messageCount: row.messageCount,
      lastMessage: row.lastMessage,
      lastMessageAt: row.lastMessageAt,
    }),
  );

  return { items, meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /ai/conversations/:id
// --------------------------------------------------------------------------

export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<{ conversation: AiConversationDto; messageCount: number; messages: AiMessageDto[] }> {
  const conversation = await aiRepo.findConversationById(conversationId);
  if (!conversation) throw notFound('Percakapan', conversationId);
  assertOwner(conversation, userId);

  const messageCount = await aiRepo.countMessages(conversationId);
  const rows = await aiRepo.listMessages(conversationId, {
    limit: DETAIL_MESSAGE_LIMIT,
    offset: Math.max(0, messageCount - DETAIL_MESSAGE_LIMIT),
  });

  return {
    conversation: shapeConversation(conversation, { messageCount }),
    messageCount,
    messages: rows.map(shapeMessage),
  };
}

// --------------------------------------------------------------------------
// GET /ai/conversations/:id/messages
// --------------------------------------------------------------------------

export async function listMessages(
  conversationId: string,
  userId: string,
  query: ListAiMessageQuery,
): Promise<Paginated<AiMessageDto>> {
  const conversation = await aiRepo.findConversationById(conversationId);
  if (!conversation) throw notFound('Percakapan', conversationId);
  assertOwner(conversation, userId);

  const paging = parsePagination(query);
  const rows = await aiRepo.listMessages(conversationId, paging);
  const total = await aiRepo.countMessages(conversationId);
  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return { items: rows.map(shapeMessage), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /ai/conversations/:id/close
// --------------------------------------------------------------------------

export async function closeConversation(
  conversationId: string,
  userId: string,
): Promise<{ conversation: AiConversationDto; alreadyClosed: boolean }> {
  return withTransaction(async (tx) => {
    const locked = await aiRepo.lockConversation(conversationId, tx);
    if (!locked) throw notFound('Percakapan', conversationId);
    assertOwner(locked, userId);

    if (isClosed(locked)) {
      // Menutup percakapan yang sudah tertutup diperlakukan sukses agar
      // aplikasi aman mengirim ulang request.
      const messageCount = await aiRepo.countMessages(conversationId, tx);
      return {
        conversation: shapeConversation(locked, { messageCount }),
        alreadyClosed: true,
      };
    }

    // closeConversation memfilter user_id sebagai lapisan kedua di SQL.
    const closed = await aiRepo.closeConversation(conversationId, userId, tx);
    if (!closed) throw forbidden('Percakapan ini bukan milik Anda');

    const messageCount = await aiRepo.countMessages(conversationId, tx);
    return {
      conversation: shapeConversation(closed, { messageCount }),
      alreadyClosed: false,
    };
  });
}

