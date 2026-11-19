import { withTransaction, type TransactionClient } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  ORDER_CANCELLABLE_STATUS,
  ORDER_STATUS_FLOW,
  type DiscountType,
  type OrderStatus,
} from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as addressRepo from '../repositories/address.repository.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as deliveryRepo from '../repositories/delivery.repository.js';
import * as loyaltyRepo from '../repositories/loyalty.repository.js';
import * as orderRepo from '../repositories/order.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as promoRepo from '../repositories/promo.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import * as storeService from './store.service.js';
import { generateOrderNumber, sha256 } from '../utils/codeGenerator.js';
import {
  calculateDiscountAmount,
  calculateLineTotal,
  calculateOrderTotals,
  formatIdr,
  roundIdr,
} from '../utils/money.js';
import { sendPush, sendSms } from '../utils/notifier.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, json, num, str, strOrNull } from '../utils/serialize.js';
import type { CancelOrderInput, CreateOrderInput, ListMyOrderQuery } from '../validators/order.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

const CURRENCY = 'IDR';

/** Batas percobaan generate nomor pesanan sebelum menyerah. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/** Panjang bagian acak dari nomor pesanan yang diturunkan idempotency key. */
const ORDER_NUMBER_SUFFIX_LENGTH = 12;

/** Prefix idempotensi poin dari order yang selesai (dipakai delivery.service). */
const POINTS_IDEMPOTENCY_PREFIX = 'order-completed:';

/** Prefix idempotensi saat poin ditarik kembali karena pesanan dibatalkan. */
const POINTS_REFUND_IDEMPOTENCY_PREFIX = 'order-cancelled:';

export interface CreateOrderOptions {
  idempotencyKey?: string | null;
  ipAddress?: string | null;
  /** Staf/kasir boleh membuat order walau toko sedang tutup. */
  isStaff?: boolean;
}

export interface ListAdminOrderQuery {
  page?: number;
  limit?: number;
  orderStatus?: string;
  paymentStatus?: string;
  branchId?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: 'recent' | 'oldest' | 'total_desc';
}

export interface AdminOrderStatusInput {
  toStatus: OrderStatus;
  note?: string;
}

export interface AuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

/** Input cancel digabung dengan orderId dari path parameter. */
export interface CancelOrderRequest extends CancelOrderInput {
  orderId: string;
}

/** Satu modifier yang sudah divalidasi terhadap grup dan opsinya. */
interface ResolvedModifier {
  optionId: string;
  groupId: string;
  groupName: string;
  optionName: string;
  unitPriceDeltaIdr: number;
  quantity: number;
}

/** Satu baris order_items yang seluruh harganya sudah dihitung di server. */
interface ResolvedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPriceIdr: number;
  modifiersTotalIdr: number;
  lineTotalIdr: number;
  specialInstructions: string | null;
  modifiers: ResolvedModifier[];
}

/** Hasil penerapan promo code atau voucher. */
interface AppliedDiscount {
  promoId: string | null;
  voucherId: string | null;
  discountIdr: number;
  promoName: string | null;
}

/** Snapshot alamat tujuan untuk pesanan delivery. */
interface ResolvedDeliveryAddress {
  addressId: string;
  recipientName: string;
  recipientPhone: string;
  snapshot: Record<string, unknown> | null;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeOrderSummary(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    orderNumber: str(row.orderNumber),
    orderStatus: str(row.orderStatus),
    paymentStatus: str(row.paymentStatus),
    fulfillmentType: str(row.fulfillmentType),
    currency: str(row.currency, CURRENCY),
    subtotalIdr: num(row.subtotalIdr),
    discountIdr: num(row.discountIdr),
    taxIdr: num(row.taxIdr),
    deliveryFeeIdr: num(row.deliveryFeeIdr),
    serviceFeeIdr: num(row.serviceFeeIdr),
    totalIdr: num(row.totalIdr),
    branchId: strOrNull(row.branchId),
    branchName: strOrNull(row.branchName),
    branchCode: strOrNull(row.branchCode),
    itemCount: num(row.itemCount),
    thumbnailUrl: strOrNull(row.thumbnailUrl),
    deliveryStatus: strOrNull(row.deliveryStatus),
    placedAt: iso(row.placedAt),
    acceptedAt: iso(row.acceptedAt),
    completedAt: iso(row.completedAt),
    cancelledAt: iso(row.cancelledAt),
    createdAt: iso(row.createdAt),
  };
}

function shapeOrderDetail(row: Record<string, unknown>) {
  return {
    ...shapeOrderSummary(row),
    userId: str(row.userId),
    promoId: strOrNull(row.promoId),
    voucherId: strOrNull(row.voucherId),
    customerNotes: strOrNull(row.customerNotes),
    tableId: strOrNull(row.tableId),
    pickupAt: iso(row.pickupAt),
    addressId: strOrNull(row.addressId),
    deliveryRecipientName: strOrNull(row.deliveryRecipientName),
    deliveryRecipientPhone: strOrNull(row.deliveryRecipientPhone),
    deliveryAddressSnapshot: json<Record<string, unknown>>(row.deliveryAddressSnapshot, {}),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeOrderItem(row: Record<string, unknown>) {
  const modifiers = Array.isArray(row.modifiers)
    ? (row.modifiers as Record<string, unknown>[])
    : [];

  return {
    id: str(row.id),
    orderId: strOrNull(row.orderId),
    productId: strOrNull(row.productId),
    variantId: strOrNull(row.variantId),
    productName: str(row.productNameSnapshot),
    variantName: str(row.variantNameSnapshot),
    sku: strOrNull(row.skuSnapshot),
    quantity: num(row.quantity),
    unitPriceIdr: num(row.unitPriceIdr),
    modifiersTotalIdr: num(row.modifiersTotalIdr),
    lineTotalIdr: num(row.lineTotalIdr),
    itemStatus: str(row.itemStatus),
    specialInstructions: strOrNull(row.specialInstructions),
    imageUrl: strOrNull(row.imageUrl),
    modifiers: modifiers.map((modifier) => ({
      id: strOrNull(modifier.id),
      groupName: str(modifier.groupName),
      optionName: str(modifier.optionName),
      priceDeltaIdr: num(modifier.priceDeltaIdr),
      quantity: num(modifier.quantity),
    })),
    createdAt: iso(row.createdAt),
  };
}

function shapeStatusHistory(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    fromStatus: strOrNull(row.fromStatus),
    toStatus: str(row.toStatus),
    note: strOrNull(row.note),
    changedByName: strOrNull(row.changedByName),
    occurredAt: iso(row.occurredAt),
  };
}

function shapePaymentBrief(row: Record<string, unknown>) {
  const raw = (row.rawProviderData ?? row.raw_provider_data ?? null) as
    | Record<string, unknown>
    | null;
  return {
    id: str(row.id),
    provider: str(row.provider),
    paymentMethod: str(row.paymentMethod),
    transactionType: str(row.transactionType),
    status: str(row.status),
    amountIdr: num(row.amountIdr),
    amountReceivedIdr:
      raw?.amountReceivedIdr === undefined || raw?.amountReceivedIdr === null
        ? null
        : num(raw.amountReceivedIdr),
    changeIdr:
      raw?.changeIdr === undefined || raw?.changeIdr === null
        ? null
        : num(raw.changeIdr),
    currency: str(row.currency, CURRENCY),
    paidAt: iso(row.paidAt),
    createdAt: iso(row.createdAt),
  };
}

function shapeAdminOrderItem(row: Record<string, unknown>) {
  const modifiers = Array.isArray(row.modifiers)
    ? (row.modifiers as Record<string, unknown>[])
    : [];
  return {
    id: str(row.id),
    productId: strOrNull(row.productId),
    variantId: strOrNull(row.variantId),
    productName: str(row.productName),
    variantName: str(row.variantName),
    sku: strOrNull(row.sku),
    quantity: num(row.quantity),
    unitPriceIdr: num(row.unitPriceIdr),
    modifiersTotalIdr: num(row.modifiersTotalIdr),
    lineTotalIdr: num(row.lineTotalIdr),
    itemStatus: str(row.itemStatus),
    specialInstructions: strOrNull(row.specialInstructions),
    modifiers: modifiers.map((modifier) => ({
      id: strOrNull(modifier.id),
      groupName: str(modifier.groupName),
      optionName: str(modifier.optionName),
      priceDeltaIdr: num(modifier.priceDeltaIdr),
      quantity: num(modifier.quantity),
    })),
  };
}

function shapeAdminOrderSummary(row: Record<string, unknown>) {
  const rawItems = Array.isArray(row.items)
    ? (row.items as Record<string, unknown>[])
    : [];
  const latestPayment =
    row.latestPayment && typeof row.latestPayment === 'object'
      ? (row.latestPayment as Record<string, unknown>)
      : null;

  return {
    ...shapeOrderSummary(row),
    userId: strOrNull(row.userId),
    userName: strOrNull(row.userName),
    userPhone: strOrNull(row.userPhone),
    // Jangan fallback ke user di sini: order walk-in milik staf bisa tanpa
    // nama tamu, sedangkan order pelanggan memakai user_name sebagai nama.
    // Frontend memilih fallback yang tepat berdasarkan konteks.
    customerName:
      strOrNull(row.customerName) ?? strOrNull(row.deliveryRecipientName),
    customerPhone:
      strOrNull(row.customerPhone) ?? strOrNull(row.deliveryRecipientPhone),
    tableId: strOrNull(row.tableId),
    tableCode: strOrNull(row.tableCode),
    customerNotes: strOrNull(row.customerNotes),
    items: rawItems.map(shapeAdminOrderItem),
    latestPayment: latestPayment ? shapePaymentBrief(latestPayment) : null,
  };
}

function shapeDeliveryBrief(row: Record<string, unknown>) {
  return {
    provider: strOrNull(row.provider),
    trackingCode: strOrNull(row.trackingCode),
    deliveryStatus: str(row.deliveryStatus),
    estimatedDeliveryAt: iso(row.estimatedDeliveryAt),
    deliveredAt: iso(row.deliveredAt),
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Kuota yang nullable (null berarti tidak dibatasi). */
function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

// --------------------------------------------------------------------------
// POST /orders
// --------------------------------------------------------------------------
export async function createOrder(
  userId: string,
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
) {
  // Header Idempotency-Key lebih diprioritaskan daripada body.
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? null;

  const result = await withTransaction(async (tx) => {
    // 1. Idempotensi dicek paling awal. Advisory lock membuat dua request dengan
    //    kunci sama saling menunggu, sehingga request kedua membaca baris order
    //    yang baru saja di-commit oleh request pertama.
    if (idempotencyKey) {
      await tx.advisoryLock(`order-create:${idempotencyKey}`);
      const replay = await replayExistingOrder(idempotencyKey, userId, tx);
      if (replay) return { replayed: true, order: replay };
    }

    if (!(await branchRepo.branchExists(input.branchId, tx))) {
      throw notFound('Cabang', input.branchId);
    }

    // Order pelanggan ditolak saat toko tutup. Staf/kasir tetap bisa mencatat
    // pesanan walk-in, misalnya untuk pesanan yang masuk sebelum tutup.
    if (!opts.isStaff) {
      const store = await storeService.getStore(input.branchId);
      if (!store.isOpen) {
        throw unprocessable(
          'Toko sedang tutup. Silakan pesan lagi pada jam operasional.',
        );
      }
    }

    // 2. Harga SELURUHNYA dihitung ulang dari variant + modifier. Nilai harga
    //    yang dikirim client tidak pernah dipakai.
    const items = await resolveOrderItems(input, tx);
    const subtotalIdr = items.reduce((total, item) => total + item.lineTotalIdr, 0);
    if (subtotalIdr <= 0) throw unprocessable('Total belanja harus lebih besar dari nol');

    // 3. Aturan per jenis layanan.
    const deliveryAddress = await resolveDeliveryAddress(input, userId, tx);
    await assertDineInTable(input, tx);
    assertPickupAt(input);

    // 4. Promo / voucher dihitung terhadap subtotal yang baru dihitung.
    const productIds = [...new Set(items.map((item) => item.productId))];
    const discount = await resolveDiscount(input, userId, subtotalIdr, productIds, items, tx);
    // Diskon manual dari kasir ditambahkan setelah promo otomatis, lalu
    // dijepit agar total tidak pernah negatif.
    const manualDiscountIdr = Math.min(
      Math.max(0, Math.round(input.manualDiscountIdr ?? 0)),
      Math.max(0, subtotalIdr - discount.discountIdr),
    );
    const totalDiscountIdr = Math.min(subtotalIdr, discount.discountIdr + manualDiscountIdr);

    const totals = calculateOrderTotals({
      subtotalIdr,
      discountIdr: totalDiscountIdr,
      deliveryFeeIdr: input.fulfillmentType === 'delivery' ? env.DELIVERY_FEE_IDR : 0,
      // Biaya servis hanya berlaku untuk pesanan yang disajikan di tempat.
      serviceFeeIdr: input.fulfillmentType === 'dine_in' ? env.SERVICE_FEE_IDR : 0,
    });

    const orderNumber = idempotencyKey
      ? idempotentOrderNumber(idempotencyKey)
      : await generateAvailableOrderNumber(tx);

    const created = await orderRepo.insertOrder(
      {
        orderNumber,
        userId,
        branchId: input.branchId,
        fulfillmentType: input.fulfillmentType,
        subtotalIdr: totals.subtotalIdr,
        discountIdr: totals.discountIdr,
        taxIdr: totals.taxIdr,
        deliveryFeeIdr: totals.deliveryFeeIdr,
        serviceFeeIdr: totals.serviceFeeIdr,
        totalIdr: totals.totalIdr,
        promoId: discount.promoId,
        voucherId: discount.voucherId,
        customerNotes: input.customerNotes ?? null,
        tableId: input.tableId ?? null,
        pickupAt: input.pickupAt ? parseDate(input.pickupAt) : null,
        addressId: deliveryAddress?.addressId ?? null,
        deliveryRecipientName:
          deliveryAddress?.recipientName ?? input.customerName ?? null,
        deliveryRecipientPhone:
          deliveryAddress?.recipientPhone ?? input.customerPhone ?? null,
        deliveryAddressSnapshot: deliveryAddress?.snapshot ?? null,
      },
      tx,
    );

    const orderId = str((created as unknown as Record<string, unknown> | null)?.id);

    // 5. Item, modifier, redemption promo, dan riwayat status.
    for (const item of items) {
      const itemRow = await orderRepo.insertOrderItem(
        {
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: item.productName,
          variantNameSnapshot: item.variantName,
          skuSnapshot: item.sku,
          quantity: item.quantity,
          unitPriceIdr: item.unitPriceIdr,
          modifiersTotalIdr: item.modifiersTotalIdr,
          lineTotalIdr: item.lineTotalIdr,
          specialInstructions: item.specialInstructions,
        },
        tx,
      );

      const orderItemId = str((itemRow as unknown as Record<string, unknown> | null)?.id);

      for (const modifier of item.modifiers) {
        await orderRepo.insertOrderItemModifier(
          {
            orderItemId,
            groupName: modifier.groupName,
            optionName: modifier.optionName,
            unitPriceDeltaIdr: modifier.unitPriceDeltaIdr,
            quantity: modifier.quantity,
            optionId: modifier.optionId,
          },
          tx,
        );
      }
    }

    if (discount.promoId) {
      await promoRepo.insertRedemption(
        {
          promoId: discount.promoId,
          userId,
          voucherId: discount.voucherId,
          orderId,
          discountIdr: discount.discountIdr,
        },
        tx,
      );
      // Voucher dibakar di transaksi yang sama supaya tidak bisa dipakai ulang
      // oleh pesanan lain, dan statusnya otomatis kembali saat transaksi di-rollback.
      if (discount.voucherId) await promoRepo.markVoucherUsed(discount.voucherId, tx);
    }

    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: null,
        toStatus: 'placed',
        changedBy: userId,
        note: 'Pesanan dibuat oleh customer',
      },
      tx,
    );

    return { replayed: false, order: await loadOrderDetail(orderId, tx) };
  });

  // 6. Notifikasi dikirim setelah COMMIT, tidak di dalam transaksi.
  if (!result.replayed) await notifyOrderPlaced(result.order);

  return result.order;
}

/** Order lama untuk idempotency key yang sama, atau null bila belum pernah dipakai. */
async function replayExistingOrder(
  idempotencyKey: string,
  userId: string,
  tx: TransactionClient,
) {
  // Idempotensi dipetakan ke order_number (UNIQUE): nomor diturunkan dari key,
  // jadi retry dengan kunci sama pasti menabrak order yang sudah ada.
  // Tipe balik findOrderByNumber masih snake_case, sementara nilainya sudah
  // di-camelize oleh repository, jadi kedua nama kolom dibaca diam-diam.
  const existing = (await orderRepo.findOrderByNumber(
    idempotentOrderNumber(idempotencyKey),
    tx,
  )) as unknown as Record<string, unknown> | null;
  if (!existing) return null;

  const ownerId = str(existing.userId ?? existing.user_id);
  if (ownerId !== userId) {
    throw conflict('Idempotency-Key sudah dipakai untuk pesanan lain');
  }

  return loadOrderDetail(str(existing.id), tx);
}

/**
 * Nomor pesanan untuk request yang membawa idempotency key.
 *
 * Tabel orders tidak punya kolom idempotency_key, jadi kunci dipetakan ke
 * order_number yang UNIQUE. Digit ambigu (0 dan 1) dibuang agar nomor tetap
 * enak dibaca dan konsisten dengan format generateOrderNumber.
 */
function idempotentOrderNumber(idempotencyKey: string): string {
  const suffix = sha256(idempotencyKey).toUpperCase().replace(/[01]/g, '').slice(0, ORDER_NUMBER_SUFFIX_LENGTH);
  return `${env.ORDER_NUMBER_PREFIX}-${suffix}`;
}

/** Nomor acak dari generateOrderNumber, diulang bila sudah dipakai pesanan lain. */
async function generateAvailableOrderNumber(tx: TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = generateOrderNumber();
    if (!(await orderRepo.orderNumberExists(candidate, tx))) return candidate;
  }

  throw conflict('Gagal membuat nomor pesanan yang unik, silakan coba lagi');
}

/**
 * Validasi dan harga setiap item.
 *
 * Harga varian dikunci (FOR UPDATE) supaya tidak berubah di tengah kalkulasi,
 * lalu modifier dicek terhadap grup min/max produk dan dihitung ulang di server.
 */
async function resolveOrderItems(
  input: CreateOrderInput,
  tx: TransactionClient,
): Promise<ResolvedItem[]> {
  const items: ResolvedItem[] = [];

  for (const requested of input.items) {
    const variantRow = await catalogRepo.lockProductVariant(requested.variantId, tx);
    if (!variantRow) throw notFound('Varian produk', requested.variantId);

    const variant = variantRow as unknown as Record<string, unknown>;
    const productId = str(variant.productId);
    const productName = str(variant.productName);

    if (productId !== requested.productId) {
      throw unprocessable(
        `Varian yang dipilih untuk '${productName}' bukan bagian dari produk pada item ini`,
      );
    }

    const now = new Date();
    if (!bool(variant.productIsActive) || !bool(variant.variantIsActive) || variant.deletedAt) {
      throw unprocessable(`Produk '${productName}' sudah tidak tersedia`);
    }

    const availableFrom = parseDate(variant.availableFrom);
    if (availableFrom && availableFrom.getTime() > now.getTime()) {
      throw unprocessable(
        `Produk '${productName}' belum bisa dipesan sebelum ${availableFrom.toISOString()}`,
      );
    }

    const availableUntil = parseDate(variant.availableUntil);
    if (availableUntil && availableUntil.getTime() < now.getTime()) {
      throw unprocessable(
        `Produk '${productName}' sudah tidak bisa dipesan setelah ${availableUntil.toISOString()}`,
      );
    }

    const availability = (await catalogRepo.checkProductAvailability(
      productId,
      input.branchId,
      now,
      tx,
    )) as unknown as Record<string, unknown> | null;

    if (availability && !bool(availability.isAvailable)) {
      const reason = strOrNull(availability.reason);
      throw unprocessable(
        reason
          ? `Produk '${productName}' tidak tersedia di cabang ini: ${reason}`
          : `Produk '${productName}' tidak tersedia di cabang ini`,
      );
    }

    const modifiers = await resolveItemModifiers(requested, tx);
    const line = calculateLineTotal(
      num(variant.priceIdr),
      modifiers.totalIdr,
      requested.quantity,
    );

    items.push({
      productId,
      variantId: requested.variantId,
      productName,
      variantName: str(variant.variantName),
      sku: strOrNull(variant.sku),
      quantity: Math.max(1, Math.trunc(requested.quantity)),
      unitPriceIdr: line.unitPriceIdr,
      modifiersTotalIdr: line.modifiersTotalIdr,
      lineTotalIdr: line.lineTotalIdr,
      specialInstructions: requested.specialInstructions ?? null,
      modifiers: modifiers.selected,
    });
  }

  return items;
}

/** Validasi pilihan modifier terhadap grup produk dan hitung selisih harganya. */
async function resolveItemModifiers(
  requested: CreateOrderInput['items'][number],
  tx: TransactionClient,
) {
  const groupsRow = (await catalogRepo.loadVariantModifierGroups(
    requested.variantId,
    tx,
  )) as unknown as Record<string, unknown>;
  const groups = (Array.isArray(groupsRow.groups) ? groupsRow.groups : []) as Record<
    string,
    unknown
  >[];
  const options = (Array.isArray(groupsRow.options) ? groupsRow.options : []) as Record<
    string,
    unknown
  >[];

  const optionById = new Map<string, Record<string, unknown>>();
  for (const option of options) optionById.set(str(option.id), option);

  const selected: ResolvedModifier[] = [];
  const quantityByGroup = new Map<string, number>();
  let modifiersTotalIdr = 0;

  for (const choice of requested.modifiers) {
    const option = optionById.get(choice.optionId);
    if (!option) {
      throw unprocessable(
        `Pilihan tambahan '${choice.optionId}' tidak tersedia untuk produk ini`,
      );
    }

    const quantity = Math.max(1, Math.trunc(choice.quantity));
    const unitPriceDeltaIdr = roundIdr(num(option.priceDeltaIdr));
    const groupId = str(option.groupId);

    modifiersTotalIdr += unitPriceDeltaIdr * quantity;
    quantityByGroup.set(groupId, (quantityByGroup.get(groupId) ?? 0) + quantity);
    selected.push({
      optionId: str(option.id),
      groupId,
      groupName: groupNameOf(groups, groupId),
      optionName: str(option.name),
      unitPriceDeltaIdr,
      quantity,
    });
  }

  // Setiap grup punya batas bawah (wajib) dan batas atas (opsional).
  for (const group of groups) {
    const groupName = str(group.name);
    const picked = quantityByGroup.get(str(group.groupId)) ?? 0;
    const minSelect = num(group.minSelect);
    const maxSelect = num(group.maxSelect);

    if (picked < minSelect) {
      throw unprocessable(
        minSelect > 1
          ? `Pilihan '${groupName}' wajib dipilih minimal ${minSelect} item`
          : `Pilihan '${groupName}' wajib dipilih`,
      );
    }
    if (maxSelect > 0 && picked > maxSelect) {
      throw unprocessable(`Pilihan '${groupName}' maksimal ${maxSelect} item per produk`);
    }
  }

  return { selected, totalIdr: roundIdr(modifiersTotalIdr) };
}

function groupNameOf(groups: Record<string, unknown>[], groupId: string): string {
  const found = groups.find((group) => str(group.groupId) === groupId);
  return found ? str(found.name) : '';
}

/**
 * Alamat delivery harus milik user dan disalin ke order sebagai snapshot
 * supaya pesanan tetap konsisten walau alamat diedit setelahnya.
 */
async function resolveDeliveryAddress(
  input: CreateOrderInput,
  userId: string,
  tx: TransactionClient,
): Promise<ResolvedDeliveryAddress | null> {
  if (input.fulfillmentType !== 'delivery') return null;

  const addressId = input.addressId ?? null;
  if (!addressId) throw badRequest('addressId wajib diisi untuk pesanan delivery');

  // Ownership dicek lewat filter userId pada repository: alamat orang lain
  // dianggap tidak ada supaya tidak bocor.
  const address = await addressRepo.findAddress(addressId, userId, tx);
  if (!address) throw notFound('Alamat', addressId);

  const snapshot = input.useAddressSnapshot
    ? {
        label: address.label,
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        addressLine: address.addressLine,
        addressDetail: address.addressDetail,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        latitude: address.latitude,
        longitude: address.longitude,
        deliveryInstructions: address.deliveryInstructions,
      }
    : null;

  return {
    addressId,
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    snapshot,
  };
}

/** Meja dine-in harus aktif, milik cabang yang dipilih, dan belum dipakai. */
async function assertDineInTable(input: CreateOrderInput, tx: TransactionClient): Promise<void> {
  if (input.fulfillmentType !== 'dine_in') return;

  const tableId = input.tableId ?? null;
  if (!tableId) throw badRequest('tableId wajib diisi untuk pesanan dine-in');

  const table = await branchRepo.findTableById(tableId, tx);
  if (!table) throw notFound('Meja', tableId);
  if (!bool(table.isActive)) throw unprocessable('Meja yang dipilih sedang tidak dapat dipakai');
  if (str(table.branchId) !== input.branchId) {
    throw unprocessable('Meja yang dipilih bukan milik cabang pada pesanan ini');
  }

  const activeOrder = await branchRepo.findActiveOrderByTable(tableId, tx);
  if (activeOrder) {
    throw conflict(
      `Meja sedang dipakai oleh pesanan ${str(activeOrder.orderNumber)} yang masih aktif`,
    );
  }
}

/** Waktu ambil harus di masa depan supaya kurir punya waktu menyiapkan pesanan. */
function assertPickupAt(input: CreateOrderInput): void {
  if (input.fulfillmentType !== 'pickup' || !input.pickupAt) return;

  const pickupAt = parseDate(input.pickupAt);
  if (pickupAt && pickupAt.getTime() <= Date.now()) {
    throw unprocessable('Waktu pengambilan harus berada di masa depan');
  }
}

/**
 * Promo code dan voucher saling menggantikan (kolom promo_id hanya satu),
 * jadi hanya salah satu yang boleh dikirim.
 */
async function resolveDiscount(
  input: CreateOrderInput,
  userId: string,
  subtotalIdr: number,
  productIds: string[],
  items: ResolvedItem[],
  tx: TransactionClient,
): Promise<AppliedDiscount> {
  if (input.promoCode && input.voucherId) {
    throw badRequest('Gunakan promoCode atau voucherId, bukan keduanya sekaligus');
  }

  // Diskon menu otomatis tetap berlaku sebagai harga menu, lalu voucher/promo
  // code dihitung dari subtotal setelah diskon menu tersebut.
  const auto = await computeAutoDiscount(userId, input.branchId, subtotalIdr, items, tx);
  const effectiveSubtotalIdr = Math.max(0, subtotalIdr - auto.discountIdr);

  if (input.voucherId) {
    const applied = await applyVoucher(
      input.voucherId,
      userId,
      input.branchId,
      effectiveSubtotalIdr,
      productIds,
      tx,
    );
    return {
      ...applied,
      discountIdr: Math.min(subtotalIdr, auto.discountIdr + applied.discountIdr),
    };
  }
  if (input.promoCode) {
    const applied = await applyPromoCode(
      input.promoCode,
      userId,
      input.branchId,
      effectiveSubtotalIdr,
      productIds,
      tx,
    );
    return {
      ...applied,
      discountIdr: Math.min(subtotalIdr, auto.discountIdr + applied.discountIdr),
    };
  }

  // Tanpa kode: catat pemakaian promo diskon menu (kuota & audit).
  if (!auto.promo) return auto.empty;
  return lockAutoDiscount(userId, auto, tx);
}

/** Diskon satu unit produk sesuai aturan promo diskon menu. */
function autoUnitDiscount(promo: Record<string, unknown>, unitPriceIdr: number): number {
  const unit = Math.max(0, Math.round(unitPriceIdr));
  if (unit === 0) return 0;

  let discount = 0;
  if (str(promo.discountType) === 'percentage') {
    discount = Math.round((unit * Math.min(100, Math.max(0, num(promo.discountValue)))) / 100);
  } else if (str(promo.discountType) === 'fixed') {
    discount = Math.max(0, Math.round(num(promo.discountValue)));
  }

  const maxPerUnit = nullableNum(promo.maximumDiscountIdr);
  if (maxPerUnit !== null) discount = Math.min(discount, maxPerUnit);

  return Math.min(unit, discount);
}

/**
 * Promo diskon menu tidak memakai kode. Pilih promo aktif yang memberi
 * diskon terbesar untuk item yang tercakup eligibility produk/kategori.
 */
interface AutoDiscount {
  promo: Record<string, unknown> | null;
  discountIdr: number;
  empty: AppliedDiscount;
}

async function computeAutoDiscount(
  userId: string,
  branchId: string,
  subtotalIdr: number,
  items: ResolvedItem[],
  tx: TransactionClient,
): Promise<AutoDiscount> {
  const empty: AppliedDiscount = {
    promoId: null,
    voucherId: null,
    discountIdr: 0,
    promoName: null,
  };

  const rows = await promoRepo.listActiveAutoPromos(tx);
  if (rows.length === 0) return { promo: null, discountIdr: 0, empty };

  const productIds = [...new Set(items.map((item) => item.productId))];
  let best: { promo: Record<string, unknown>; discountIdr: number } | null = null;

  for (const row of rows) {
    const promo = row as Record<string, unknown>;
    if (str(promo.discountType) === 'free_item') continue;

    const rules = json<Record<string, unknown>>(promo.rules, {});
    const allowedBranches = rules.branchIds ?? rules.allowedBranchIds ?? rules.branches;
    if (Array.isArray(allowedBranches) && allowedBranches.length > 0) {
      if (!allowedBranches.some((item) => str(item) === branchId)) continue;
    }

    const minimumOrderIdr = num(promo.minimumOrderIdr);
    if (minimumOrderIdr > 0 && subtotalIdr < minimumOrderIdr) continue;

    const remaining = remainingQuotaFromRow(promo);
    if (remaining !== null && remaining <= 0) continue;

    const perUserQuota = nullableNum(promo.perUserQuota);
    if (perUserQuota !== null) {
      const used = await promoRepo.countUserVoucherRedemptions(str(promo.id), userId, tx);
      if (used >= perUserQuota) continue;
    }

    const promoId = str(promo.id);
    const eligible = new Set(await promoRepo.eligibleProductIdsForPromo(promoId, productIds, tx));
    if (eligible.size === 0) continue;

    let discountIdr = 0;
    for (const item of items) {
      if (!eligible.has(item.productId)) continue;
      discountIdr += autoUnitDiscount(promo, item.unitPriceIdr) * item.quantity;
    }
    discountIdr = Math.min(subtotalIdr, discountIdr);
    if (discountIdr <= 0) continue;

    if (!best || discountIdr > best.discountIdr) best = { promo, discountIdr };
  }

  if (!best) return { promo: null, discountIdr: 0, empty };
  return { promo: best.promo, discountIdr: best.discountIdr, empty };
}

/** Kunci promo diskon menu dan pastikan kuota masih tersedia sebelum dipakai. */
async function lockAutoDiscount(
  userId: string,
  auto: AutoDiscount,
  tx: TransactionClient,
): Promise<AppliedDiscount> {
  if (!auto.promo) return auto.empty;

  const promoId = str(auto.promo.id);
  await tx.advisoryLock(`promo-redeem:${promoId}`);
  const locked = await promoRepo.lockPromoById(promoId, tx);
  if (!locked) return auto.empty;

  const promo = locked as Record<string, unknown>;
  await assertPromoQuota(promoId, userId, tx);
  if (remainingQuotaFromRow(promo) === 0) return auto.empty;

  return {
    promoId,
    voucherId: null,
    discountIdr: auto.discountIdr,
    promoName: strOrNull(promo.name),
  };
}

/** Sisa kuota dari baris promo yang sudah membawa total_redeemed. */
function remainingQuotaFromRow(promo: Record<string, unknown>): number | null {
  const quota = nullableNum(promo.globalQuota);
  if (quota === null) return null;
  return Math.max(0, quota - num(promo.totalRedeemed));
}

/** Promo code ditegakkan dari kode, bukan id, dan dikunci agar kuota tidak bentrok. */
async function applyPromoCode(
  code: string,
  userId: string,
  branchId: string,
  subtotalIdr: number,
  productIds: string[],
  tx: TransactionClient,
): Promise<AppliedDiscount> {
  const promoRow = await promoRepo.lockPromoByCode(code, tx);
  if (!promoRow) throw notFound('Promo', code);

  const promo = promoRow as Record<string, unknown>;
  const promoId = str(promo.id);
  // Kuota dibaca ulang setelah lock baris promo lolos supaya dua transaksi
  // bersamaan tidak memakai kuota terakhir yang sama.
  await tx.advisoryLock(`promo-redeem:${promoId}`);

  assertPromoUsable(promo, branchId, subtotalIdr);
  await assertPromoQuota(promoId, userId, tx);

  const eligible = await promoRepo.isProductEligible(promoId, productIds, tx);
  if (!eligible) {
    throw unprocessable('Ada produk di keranjang yang tidak termasuk promo ini');
  }

  return {
    promoId,
    voucherId: null,
    discountIdr: discountOf(promo, subtotalIdr),
    promoName: strOrNull(promo.name),
  };
}

/** Voucher hanya bisa dipakai pemiliknya, sekali, dan selama masa berlakunya. */
async function applyVoucher(
  voucherId: string,
  userId: string,
  branchId: string,
  subtotalIdr: number,
  productIds: string[],
  tx: TransactionClient,
): Promise<AppliedDiscount> {
  const voucherRow = await promoRepo.lockUserVoucher(voucherId, userId, tx);
  if (!voucherRow) throw notFound('Voucher', voucherId);

  const voucher = voucherRow as Record<string, unknown>;
  const promoId = str(voucher.promoId);
  await tx.advisoryLock(`voucher-redeem:${voucherId}`);

  if (str(voucher.status) !== 'available') {
    throw unprocessable(`Voucher dengan status '${str(voucher.status)}' tidak bisa dipakai lagi`);
  }
  if (!bool(voucher.promoIsActive)) {
    throw unprocessable('Promo dari voucher ini sedang tidak aktif');
  }

  const now = new Date();
  const expiresAt = parseDate(voucher.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw unprocessable('Voucher sudah kedaluwarsa');
  }

  // Baris promo ikut dikunci supaya kuota global dihitung konsisten.
  const promoRow = await promoRepo.lockPromoById(promoId, tx);
  if (!promoRow) throw notFound('Promo', promoId);

  const promo = promoRow as Record<string, unknown>;
  assertPromoUsable(promo, branchId, subtotalIdr);
  await assertPromoQuota(promoId, userId, tx);

  const eligible = await promoRepo.isProductEligible(promoId, productIds, tx);
  if (!eligible) {
    throw unprocessable('Ada produk di keranjang yang tidak termasuk promo ini');
  }

  return {
    promoId,
    voucherId,
    discountIdr: discountOf(promo, subtotalIdr),
    promoName: strOrNull(promo.name),
  };
}

/** Promo hanya berlaku ketika aktif dan berada di dalam periodenya. */
function assertPromoPeriod(promo: Record<string, unknown>): void {
  if (!bool(promo.isActive)) throw unprocessable('Promo ini sedang tidak aktif');

  const now = new Date();
  const startsAt = parseDate(promo.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) {
    throw unprocessable('Periode promo belum dimulai');
  }

  const endsAt = parseDate(promo.endsAt);
  if (endsAt && endsAt.getTime() < now.getTime()) {
    throw unprocessable('Periode promo sudah berakhir');
  }
}

/**
 * Syarat promo terhadap pesanan: cabang sesuai dan minimum belanja terpenuhi.
 * rules.branchIds yang kosong berarti promo berlaku untuk semua cabang.
 */
function assertPromoUsable(
  promo: Record<string, unknown>,
  branchId: string,
  subtotalIdr: number,
): void {
  assertPromoPeriod(promo);

  const rules = json<Record<string, unknown>>(promo.rules, {});
  const allowedBranches = rules.branchIds ?? rules.allowedBranchIds ?? rules.branches;
  if (Array.isArray(allowedBranches) && allowedBranches.length > 0) {
    const matchesBranch = allowedBranches.some((item) => str(item) === branchId);
    if (!matchesBranch) {
      throw unprocessable('Promo ini tidak berlaku untuk cabang pada pesanan ini');
    }
  }

  const minimumOrderIdr = num(promo.minimumOrderIdr);
  if (minimumOrderIdr > 0 && subtotalIdr < minimumOrderIdr) {
    throw unprocessable(
      `Minimum belanja untuk promo ini adalah ${formatIdr(minimumOrderIdr)} (kurang ${formatIdr(minimumOrderIdr - subtotalIdr)})`,
    );
  }
}

/** Kuota global dan kuota per user promo. */
async function assertPromoQuota(
  promoId: string,
  userId: string,
  tx: TransactionClient,
): Promise<void> {
  const promo = await promoRepo.findPromoById(promoId, tx);
  if (!promo) throw notFound('Promo', promoId);

  const row = promo as Record<string, unknown>;
  const globalQuota = nullableNum(row.globalQuota);
  if (globalQuota !== null) {
    const redeemed = await promoRepo.countPromoRedemptions(promoId, tx);
    if (redeemed >= globalQuota) throw unprocessable('Kuota promo sudah habis');
  }

  const perUserQuota = nullableNum(row.perUserQuota);
  if (perUserQuota !== null) {
    const redeemed = await promoRepo.countUserVoucherRedemptions(promoId, userId, tx);
    if (redeemed >= perUserQuota) {
      throw unprocessable('Kuota promo untuk akun ini sudah habis');
    }
  }
}

/** Nominal diskon dihitung server-side dari aturan promo. */
function discountOf(promo: Record<string, unknown>, subtotalIdr: number): number {
  const discountIdr = calculateDiscountAmount({
    discountType: str(promo.discountType) as DiscountType,
    discountValue: num(promo.discountValue),
    subtotalIdr,
    maximumDiscountIdr: nullableNum(promo.maximumDiscountIdr),
  });

  if (discountIdr <= 0) {
    throw unprocessable('Promo ini tidak menghasilkan diskon untuk pesanan tersebut');
  }

  return discountIdr;
}

// --------------------------------------------------------------------------
// GET /me/orders
// --------------------------------------------------------------------------
export async function listOrders(
  userId: string,
  query: ListMyOrderQuery,
): Promise<Paginated<ReturnType<typeof shapeOrderSummary>>> {
  const paging = parsePagination(query);
  const filters: orderRepo.ListOrderFilters = {
    orderStatus: query.orderStatus,
    paymentStatus: query.paymentStatus,
    branchId: query.branchId,
    from: query.from,
    to: query.to,
    sort: query.sort,
  };

  const rows = await orderRepo.listOrdersForUser(userId, filters, paging);
  const total = await orderRepo.countOrdersForUser(userId, filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return { items: rows.map(shapeOrderSummary), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /admin/orders - antrean pesanan untuk kasir
// --------------------------------------------------------------------------
export async function listAdminOrders(
  query: ListAdminOrderQuery,
): Promise<Paginated<ReturnType<typeof shapeAdminOrderSummary>>> {
  const paging = parsePagination(query);
  const filters: orderRepo.ListOrderFilters = {
    orderStatus: query.orderStatus,
    paymentStatus: query.paymentStatus,
    branchId: query.branchId,
    from: query.from,
    to: query.to,
    q: query.q?.trim() || undefined,
    sort: query.sort ?? 'recent',
  };

  const rows = await orderRepo.listOrdersForBranch(filters, paging);
  const total = await orderRepo.countOrdersForBranch(filters);
  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map(shapeAdminOrderSummary),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// PATCH /admin/orders/:id/status - ubah status dari kasir/admin
// --------------------------------------------------------------------------
export async function updateOrderStatusByStaff(
  orderId: string,
  input: AdminOrderStatusInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const result = await withTransaction(async (tx) => {
    const order = await orderRepo.lockOrderById(orderId, tx);
    if (!order) throw notFound('Pesanan', orderId);

    const fromStatus = str(order.orderStatus);
    const toStatus = input.toStatus;

    if (fromStatus === toStatus) {
      return { changed: false, fromStatus, toStatus };
    }

    const closed: string[] = ['completed', 'cancelled', 'rejected'];
    if (closed.includes(fromStatus)) {
      throw unprocessable(
        `Pesanan berstatus '${fromStatus}' sudah final dan tidak bisa diubah`,
      );
    }

    // Kasir boleh langsung menyelesaikan/membatalkan pesanan aktif. Untuk
    // perpindahan lain, ikuti alur status yang sudah disepakati.
    const isDirectClose = toStatus === 'completed' || toStatus === 'cancelled';
    const allowed = ORDER_STATUS_FLOW[fromStatus as OrderStatus] ?? [];
    if (!isDirectClose && !allowed.includes(toStatus)) {
      throw conflict(
        `Status tidak bisa diubah dari '${fromStatus}' ke '${toStatus}'`,
      );
    }

    if (toStatus === 'cancelled') {
      await orderRepo.cancelOrderItems(orderId, tx);
    }

    await orderRepo.updateOrderStatus(
      orderId,
      {
        orderStatus: toStatus,
        acceptedAt: toStatus === 'accepted' ? true : undefined,
        completedAt: toStatus === 'completed' ? true : undefined,
        cancelledAt: toStatus === 'cancelled' ? true : undefined,
      },
      tx,
    );

    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus,
        toStatus,
        changedBy: actorUserId,
        note: input.note ?? 'Diubah oleh kasir/admin',
      },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.order.status.update',
        entityType: 'order',
        entityId: orderId,
        oldData: { orderStatus: fromStatus },
        newData: { orderStatus: toStatus, note: input.note ?? null },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { changed: true, fromStatus, toStatus };
  });

  return result;
}

// --------------------------------------------------------------------------
// GET /orders/:id
// --------------------------------------------------------------------------
export async function getOrder(orderId: string, userId: string, isStaff: boolean) {
  const order = await findReadableOrder(orderId, userId, isStaff);

  const [items, history, paidIdr, refundedIdr, payments, delivery] = await Promise.all([
    orderRepo.listOrderItems(orderId),
    orderRepo.listStatusHistory(orderId),
    paymentRepo.sumSucceededPayments(orderId),
    paymentRepo.sumRefundedPayments(orderId),
    paymentRepo.listOrderPayments(orderId, { limit: 1, offset: 0 }),
    deliveryRepo.findDeliveryByOrder(orderId),
  ]);

  const totalIdr = num(order.totalIdr);

  return {
    ...shapeOrderDetail(order),
    items: items.map(shapeOrderItem),
    statusHistory: history.map(shapeStatusHistory),
    payment: {
      paymentStatus: str(order.paymentStatus),
      paidIdr,
      refundedIdr,
      outstandingIdr: Math.max(0, totalIdr - paidIdr + refundedIdr),
      latestTransaction: payments[0]
        ? shapePaymentBrief(payments[0] as Record<string, unknown>)
        : null,
    },
    delivery: delivery ? shapeDeliveryBrief(delivery) : null,
  };
}

/** Pesanan milik sendiri, atau apa pun bila pemanggil staff. */
async function findReadableOrder(
  orderId: string,
  userId: string,
  isStaff: boolean,
): Promise<Record<string, unknown>> {
  // filter user_id sudah ada di query findOrderForUser sehingga tidak ada
  // risiko IDOR; pesanan milik orang lain disamakan 404.
  const order = isStaff
    ? await orderRepo.findOrderById(orderId)
    : await orderRepo.findOrderForUser(orderId, userId);
  if (!order) throw notFound('Pesanan', orderId);

  return order;
}

// --------------------------------------------------------------------------
// POST /orders/:id/cancel
// --------------------------------------------------------------------------
export async function cancelOrder(userId: string, input: CancelOrderRequest) {
  const orderId = input.orderId;
  const requestRefund = input.requestRefund !== false;

  const result = await withTransaction(async (tx) => {
    // Row lock menahan pembatalan bersamaan pada pesanan yang sama.
    const order = await orderRepo.lockOrderForUser(orderId, userId, tx);
    if (!order) throw notFound('Pesanan', orderId);

    const current = str(order.orderStatus);

    // Permintaan ulang dengan status yang sama dianggap sukses agar aplikasi
    // aman mengirim ulang tanpa gagal.
    if (current === 'cancelled') {
      return {
        changed: false,
        previousOrderStatus: current,
        pointsRefunded: 0,
        order: await loadOrderDetail(orderId, tx),
      };
    }

    if (!ORDER_CANCELLABLE_STATUS.includes(current as OrderStatus)) {
      throw unprocessable(
        `Pesanan berstatus '${current}' sehingga tidak bisa dibatalkan lagi`,
      );
    }

    const paymentStatus = str(order.paymentStatus);
    if (requestRefund && (paymentStatus === 'paid' || paymentStatus === 'partially_refunded')) {
      throw unprocessable(
        'Pesanan ini sudah dibayar. Pengembalian dana harus diproses kasir lewat endpoint refund, lalu pesanan bisa dibatalkan.',
      );
    }

    await orderRepo.cancelOrderItems(orderId, tx);
    await orderRepo.updateOrderStatus(
      orderId,
      { orderStatus: 'cancelled', cancelledAt: true },
      tx,
    );
    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: current,
        toStatus: 'cancelled',
        changedBy: userId,
        note: input.reason,
      },
      tx,
    );

    // Kuota promo dan voucher dikembalikan supaya bisa dipakai lagi.
    await promoRepo.deleteRedemptionByOrder(orderId, tx);
    const voucherId = strOrNull(order.voucherId);
    if (voucherId) await promoRepo.markVoucherAvailable(voucherId, tx);

    const pointsRefunded = await reverseEarnedPoints(orderId, userId, tx);

    return {
      changed: true,
      previousOrderStatus: current,
      pointsRefunded,
      order: await loadOrderDetail(orderId, tx),
    };
  });

  if (result.changed) await notifyOrderCancelled(result.order, input.reason);

  return { ...result.order, pointsRefunded: result.pointsRefunded };
}

/**
 * Tarik kembali poin yang sempat didapat dari order ini.
 *
 * Poin hanya diberikan saat order selesai, jadi pembatalan biasanya tidak
 * menemukan apa pun. Penjaga ini tetap dipakai supaya tidak ada poin yang
 * menggantung bila urutan proses berubah.
 */
async function reverseEarnedPoints(
  orderId: string,
  userId: string,
  tx: TransactionClient,
): Promise<number> {
  const earned = await loyaltyRepo.findPointEntryByIdempotencyKey(
    `${POINTS_IDEMPOTENCY_PREFIX}${orderId}`,
    tx,
  );
  if (!earned) return 0;

  const points = num(earned.pointsDelta);
  if (points <= 0) return 0;

  // Lock baris user supaya dua pembatalan bersamaan tidak milikkan saldo.
  await loyaltyRepo.lockUserForPoints(userId, tx);

  const reversed = await loyaltyRepo.findPointEntryByIdempotencyKey(
    `${POINTS_REFUND_IDEMPOTENCY_PREFIX}${orderId}`,
    tx,
  );
  if (reversed) return 0;

  await loyaltyRepo.insertPointEntry(
    {
      userId,
      pointsDelta: -points,
      mutationType: 'adjustment',
      description: `Poin ditarik kembali karena pesanan dibatalkan (${points} poin)`,
      referenceType: 'order',
      referenceId: orderId,
      idempotencyKey: `${POINTS_REFUND_IDEMPOTENCY_PREFIX}${orderId}`,
    },
    tx,
  );

  return points;
}

// --------------------------------------------------------------------------
// GET /orders/:id/status
// --------------------------------------------------------------------------
export async function getStatusHistory(orderId: string, userId: string, isStaff: boolean) {
  const order = await findReadableOrder(orderId, userId, isStaff);
  const history = await orderRepo.listStatusHistory(orderId);

  return {
    orderId,
    orderNumber: str(order.orderNumber),
    currentStatus: str(order.orderStatus),
    history: history.map(shapeStatusHistory),
  };
}

// --------------------------------------------------------------------------
// GET /orders/:id/items
// --------------------------------------------------------------------------
export async function listOrderItems(orderId: string, userId: string, isStaff: boolean) {
  await findReadableOrder(orderId, userId, isStaff);
  const items = await orderRepo.listOrderItems(orderId);
  return items.map(shapeOrderItem);
}

// --------------------------------------------------------------------------
// Helper internal
// --------------------------------------------------------------------------
/** Order + item + riwayat status, dipakai oleh create, cancel, dan replay. */
async function loadOrderDetail(orderId: string, tx?: TransactionClient) {
  const order = await orderRepo.findOrderById(orderId, tx);
  if (!order) throw notFound('Pesanan', orderId);

  const [items, history] = await Promise.all([
    orderRepo.listOrderItems(orderId, tx),
    orderRepo.listStatusHistory(orderId, tx),
  ]);

  return {
    ...shapeOrderDetail(order),
    items: items.map(shapeOrderItem),
    statusHistory: history.map(shapeStatusHistory),
  };
}

interface NotifiableOrder {
  id: string;
  userId: string;
  orderNumber: string;
  totalIdr: number;
}

/**
 * Notifikasi selalu dikirim setelah transaksi COMMIT. Kegagalan kanal notifikasi
 * tidak boleh menggagalkan pembuatan order yang sudah tersimpan.
 */
async function notifyOrderPlaced(order: NotifiableOrder): Promise<void> {
  await safeNotify(async () => {
    await sendPush({
      userId: order.userId,
      title: 'Pesanan diterima',
      body: `Pesanan ${order.orderNumber} sebesar ${formatIdr(order.totalIdr)} sudah kami terima.`,
      actionUrl: `/me/orders/${order.id}`,
    });
    await sendSmsToUser(
      order.userId,
      `Semoet: pesanan ${order.orderNumber} diterima, total ${formatIdr(order.totalIdr)}. Lacak statusnya di aplikasi.`,
    );
  }, order.orderNumber);
}

async function notifyOrderCancelled(
  order: NotifiableOrder,
  reason: string,
): Promise<void> {
  await safeNotify(async () => {
    await sendPush({
      userId: order.userId,
      title: 'Pesanan dibatalkan',
      body: `Pesanan ${order.orderNumber} sudah dibatalkan.`,
      actionUrl: `/me/orders/${order.id}`,
    });
    await sendSmsToUser(
      order.userId,
      `Semoet: pesanan ${order.orderNumber} dibatalkan. Alasan: ${reason}.`,
    );
  }, order.orderNumber);
}

async function safeNotify(work: () => Promise<void>, orderNumber: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    logger.warn(
      { err: error, orderNumber },
      '[order] notifikasi pesanan gagal dikirim',
    );
  }
}

async function sendSmsToUser(userId: string, body: string): Promise<void> {
  if (!userId) return;

  const profile = await userRepo.findProfile(userId);
  const phone = strOrNull(profile?.phoneE164);
  if (!phone) return;

  await sendSms({ to: phone, body });
}