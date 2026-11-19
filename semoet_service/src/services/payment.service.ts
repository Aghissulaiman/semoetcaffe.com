import { withTransaction, type TransactionClient } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyWebhookSignature } from '../config/rawBody.js';
import type { PaymentPurpose, PaymentTransactionStatus } from '../config/constants.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
  unprocessable,
} from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import * as orderRepo from '../repositories/order.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as reservationRepo from '../repositories/reservation.repository.js';
import { formatIdr, roundIdr } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import { getPaymentGateway, type PaymentInstructions, type ProviderChargeStatus } from './paymentGateway.provider.js';
import type {
  CreateChargeInput,
  ListOrderPaymentQuery,
  PaymentWebhookInput,
  RefundInput,
} from '../validators/payment.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

const CURRENCY = 'IDR';

/** TRANSACTION_TYPE dari constants, ditulis eksplisit agar mudah dibaca. */
const TRANSACTION_CHARGE = 'charge';
const TRANSACTION_REFUND = 'refund';

/** Status order yang sudah tidak bisa dibayar lagi. */
const ORDER_CLOSED_STATUS: string[] = ['completed', 'cancelled', 'rejected'];

/** Status booking event yang sudah tidak bisa dibayar lagi. */
const EVENT_CLOSED_STATUS: string[] = ['completed', 'cancelled'];

/** payment_purpose -> jenis pembayaran event. */
const EVENT_PURPOSE_KIND: Record<string, string> = {
  event_deposit: 'deposit',
  event_installment: 'installment',
  event_final: 'final',
  event_refund: 'refund',
};

/** Status payment yang tidak boleh diturunkan lagi oleh webhook. */
const TERMINAL_PAYMENT_STATUS: PaymentTransactionStatus[] = ['succeeded', 'failed', 'expired', 'cancelled'];

/** Batas baris pembayaran yang dipindai saat menghitung agregat refund. */
const SCAN_LIMIT = 100;

export interface ChargeOptions {
  idempotencyKey?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
}

export interface AuditOptions {
  requestId?: string | null;
  ipAddress?: string | null;
}

/** Input refund digabung dengan paymentId dari path parameter. */
export interface RefundRequest extends RefundInput {
  paymentId: string;
}

export interface ChargeResult {
  payment: ReturnType<typeof shapePayment>;
  instructions: PaymentInstructions | null;
  outstandingIdr: number | null;
  replayed: boolean;
}

export interface RefundResult {
  refund: ReturnType<typeof shapePayment>;
  original: ReturnType<typeof shapePayment>;
  outstandingRefundableIdr: number;
}

export interface WebhookResult {
  duplicated: boolean;
  paymentId: string | null;
  paymentStatus: string | null;
  orderStatus: string | null;
  bookingStatus: string | null;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapePayment(row: Record<string, unknown>) {
  const raw = (row.rawProviderData ?? row.raw_provider_data ?? null) as
    | Record<string, unknown>
    | null;
  return {
    id: str(row.id),
    orderId: strOrNull(row.orderId),
    eventBookingId: strOrNull(row.eventBookingId),
    provider: str(row.provider),
    paymentMethod: str(row.paymentMethod),
    providerReference: strOrNull(row.providerReference),
    transactionType: str(row.transactionType),
    paymentPurpose: str(row.paymentPurpose),
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
    paymentUrl: strOrNull(row.paymentUrl),
    expiresAt: iso(row.expiresAt),
    paidAt: iso(row.paidAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapePaymentEvent(row: Record<string, unknown>, includePayload: boolean) {
  return {
    id: str(row.id),
    eventType: str(row.eventType),
    providerEventId: strOrNull(row.providerEventId),
    receivedAt: iso(row.receivedAt),
    ...(includePayload
      ? { payload: (row.payload as Record<string, unknown> | null) ?? null }
      : {}),
  };
}

/** Nominal selalu integer IDR. */
function toIdr(value: unknown): number {
  return roundIdr(num(value));
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Total tagihan dari ringkasan order. Tipe balik declared getOrderFinancials
 * masih snake_case, sementara nilainya sudah di-camelize oleh repository,
 * jadi kedua nama kolom dibaca diam-diam.
 */
function orderTotalIdr(financials: unknown): number {
  const row = (financials ?? {}) as Record<string, unknown>;
  return toIdr(row.totalIdr ?? row.total_idr);
}

/**
 * Ownership transaksi: boleh dibuka pemiliknya (order/event miliknya) atau staff.
 * Untuk user biasa, transaksi milik orang lain disamakan 404 supaya tidak
 * membocorkan keberadaan transaksi.
 */
async function assertPaymentAccess(
  payment: Record<string, unknown>,
  userId: string,
  isStaff: boolean,
): Promise<void> {
  if (isStaff) return;

  const orderId = strOrNull(payment.orderId);
  if (orderId) {
    const order = await orderRepo.findOrderForUser(orderId, userId);
    if (order) return;
  }

  const eventBookingId = strOrNull(payment.eventBookingId);
  if (eventBookingId) {
    const booking = await eventRepo.findBookingForUser(eventBookingId, userId);
    if (booking) return;
  }

  // Pembayaran DP reservasi: pemilik reservasi berhak mengakses transaksinya.
  const reservationId = strOrNull(payment.reservationId);
  if (reservationId) {
    const reservation = await reservationRepo.findReservationById(reservationId);
    if (reservation && str(reservation.userId) === userId) return;
  }

  throw notFound('Transaksi pembayaran', str(payment.id));
}

// --------------------------------------------------------------------------
// POST /payments/charge
// --------------------------------------------------------------------------
export async function createCharge(
  userId: string,
  input: CreateChargeInput,
  opts: ChargeOptions = {},
): Promise<ChargeResult> {
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? null;

  // 1. Idempotensi dicek paling awal: retry dari mobile wajib mengembalikan
  //    transaksi lama, bukan membuat transaksi kedua.
  if (idempotencyKey) {
    const existing = await paymentRepo.findPaymentByIdempotencyKey(idempotencyKey);
    if (existing) {
      await assertPaymentAccess(existing, userId, false);
      return {
        payment: shapePayment(existing),
        instructions: buildReplayInstructions(existing),
        outstandingIdr: null,
        replayed: true,
      };
    }
  }

  const target = resolvePurpose(input);

  // 2. Validasi parent (order/event booking) dan nominal dalam transaksi agar
  //    dua request bersamaan tidak bisaított pembayaran dobel.
  const created = await withTransaction(async (tx) => {
    const context = await resolveChargeContext(tx, userId, input, target);

    const payment = await paymentRepo.insertPayment(
      {
        orderId: context.orderId,
        eventBookingId: context.eventBookingId,
        provider: input.provider ?? env.PAYMENT_PROVIDER_DEFAULT,
        paymentMethod: input.paymentMethod,
        providerReference: null,
        idempotencyKey,
        transactionType: context.transactionType,
        paymentPurpose: context.paymentPurpose,
        amountIdr: context.amountIdr,
      },
      tx,
    );

    return { payment: payment as unknown as Record<string, unknown>, context };
  });

  // 3. Gateway dipanggil DI LUAR transaksi supaya lock baris tidak tertahan
  //    selama menunggu respons HTTP provider.
  const gateway = getPaymentGateway();
  const charge = await gateway.createCharge({
    paymentId: str(created.payment.id),
    provider: str(created.payment.provider),
    paymentMethod: str(created.payment.paymentMethod),
    amountIdr: num(created.payment.amountIdr),
    currency: str(created.payment.currency, CURRENCY),
    paymentPurpose: created.context.paymentPurpose,
    orderId: created.context.orderId,
    eventBookingId: created.context.eventBookingId,
    idempotencyKey,
  });

  const updated = await paymentRepo.updatePaymentStatus(str(created.payment.id), {
    providerReference: charge.providerReference,
    paymentUrl: charge.instructions.paymentUrl,
    rawProviderData: { gateway: gateway.name, channel: charge.instructions.channel },
  });

  return {
    payment: shapePayment((updated ?? created.payment) as Record<string, unknown>),
    instructions: charge.instructions,
    outstandingIdr: created.context.outstandingIdr,
    replayed: false,
  };
}

type ChargeTarget = { kind: 'order' } | { kind: 'event'; eventKind: string };

/** payment_purpose menentukan parent: order atau booking event. */
function resolvePurpose(input: CreateChargeInput): ChargeTarget {
  const purpose = input.paymentPurpose;

  if (purpose === undefined) {
    return input.eventBookingId ? { kind: 'event', eventKind: 'deposit' } : { kind: 'order' };
  }
  if (purpose === 'order') return { kind: 'order' };

  const eventKind = EVENT_PURPOSE_KIND[purpose];
  if (!eventKind || eventKind === 'refund') {
    throw badRequest(
      'payment_purpose refund hanya bisa dibuat oleh staff lewat endpoint refund',
    );
  }
  return { kind: 'event', eventKind };
}

interface ChargeContext {
  orderId: string | null;
  eventBookingId: string | null;
  transactionType: string;
  paymentPurpose: PaymentPurpose;
  amountIdr: number;
  outstandingIdr: number;
}

async function resolveChargeContext(
  tx: TransactionClient,
  userId: string,
  input: CreateChargeInput,
  target: ChargeTarget,
): Promise<ChargeContext> {
  if (target.kind === 'order') {
    if (!input.orderId) throw badRequest('orderId wajib diisi untuk pembayaran pesanan');

    const order = await orderRepo.lockOrderForUser(input.orderId, userId, tx);
    if (!order) throw notFound('Pesanan', input.orderId);

    const orderStatus = str(order.orderStatus);
    if (ORDER_CLOSED_STATUS.includes(orderStatus)) {
      throw unprocessable(`Pesanan sudah berstatus '${orderStatus}' sehingga tidak bisa dibayar`);
    }

    const financials = await orderRepo.getOrderFinancials(input.orderId, tx);
    const paidIdr = await paymentRepo.sumSucceededPayments(input.orderId, tx);
    const refundedIdr = await paymentRepo.sumRefundedPayments(input.orderId, tx);
    const outstandingIdr = Math.max(0, orderTotalIdr(financials) - paidIdr + refundedIdr);

    return {
      orderId: input.orderId,
      eventBookingId: null,
      transactionType: TRANSACTION_CHARGE,
      paymentPurpose: 'order',
      amountIdr: resolveAmountIdr(input.amountIdr, outstandingIdr, 'pesanan'),
      outstandingIdr,
    };
  }

  if (!input.eventBookingId) {
    throw badRequest('eventBookingId wajib diisi untuk pembayaran booking event');
  }

  const booking = await eventRepo.lockBookingForUser(input.eventBookingId, userId, tx);
  if (!booking) throw notFound('Booking event', input.eventBookingId);

  const bookingStatus = str(booking.status);
  if (EVENT_CLOSED_STATUS.includes(bookingStatus)) {
    throw unprocessable(`Booking event sudah berstatus '${bookingStatus}' sehingga tidak bisa dibayar`);
  }

  const paidIdr = await eventRepo.sumEventBookingPaid(input.eventBookingId, tx);
  // Deposit memakai nominal deposit; installment/final memakai total subtotal.
  const baseIdr = target.eventKind === 'deposit' ? toIdr(booking.depositIdr) : toIdr(booking.subtotalIdr);
  const outstandingIdr = Math.max(0, baseIdr - paidIdr);

  const purpose = (
    Object.keys(EVENT_PURPOSE_KIND) as PaymentPurpose[]
  ).find((key) => EVENT_PURPOSE_KIND[key] === target.eventKind) ?? 'event_deposit';

  return {
    orderId: null,
    eventBookingId: input.eventBookingId,
    transactionType: TRANSACTION_CHARGE,
    paymentPurpose: purpose,
    amountIdr: resolveAmountIdr(input.amountIdr, outstandingIdr, 'booking event'),
    outstandingIdr,
  };
}

/** Nominal yang dikirim harus <= sisa tagihan; tanpa nominal berarti bayar penuh. */
function resolveAmountIdr(requested: number | undefined, outstandingIdr: number, label: string): number {
  if (requested === undefined) {
    if (outstandingIdr <= 0) throw unprocessable(`Tidak ada sisa tagihan yang perlu dibayar pada ${label}`);
    return outstandingIdr;
  }

  const amountIdr = toIdr(requested);
  if (amountIdr <= 0) throw badRequest('Nominal pembayaran harus lebih besar dari nol');
  if (amountIdr > outstandingIdr) {
    throw unprocessable(
      `Nominal pembayaran melebihi sisa tagihan ${label} (sisa ${formatIdr(outstandingIdr)})`,
    );
  }
  return amountIdr;
}

/** Instruksi ringan untuk transaksi lama yang dikembalikan karena idempotensi. */
function buildReplayInstructions(payment: Record<string, unknown>): PaymentInstructions | null {
  const providerReference = strOrNull(payment.providerReference);
  if (!providerReference) return null;

  const paymentMethod = str(payment.paymentMethod);
  return {
    method: paymentMethod,
    channel: channelForReplay(paymentMethod),
    reference: providerReference,
    amountIdr: toIdr(payment.amountIdr),
    currency: str(payment.currency, CURRENCY),
    expiresAt: iso(payment.expiresAt),
    paymentUrl: strOrNull(payment.paymentUrl),
    qrString: null,
    virtualAccountNumber: null,
    steps: ['Transaksi ini sudah pernah dibuat, gunakan instruksi yang sama untuk melanjutkan pembayaran.'],
  };
}

function channelForReplay(paymentMethod: string): PaymentInstructions['channel'] {
  switch (paymentMethod) {
    case 'qris':
      return 'qris';
    case 'virtual_account':
      return 'virtual_account';
    case 'bank_transfer':
      return 'bank_transfer';
    case 'ewallet':
      return 'ewallet';
    case 'card':
      return 'card';
    default:
      return 'cash';
  }
}

// --------------------------------------------------------------------------
// POST /admin/orders/:id/payments - pembayaran manual dari kasir
// --------------------------------------------------------------------------
export interface ManualPaymentInput {
  paymentMethod: 'cash' | 'qris' | 'card' | 'bank_transfer';
  amountReceivedIdr?: number;
  note?: string;
}

export interface ManualPaymentAudit {
  requestId?: string | null;
  ipAddress?: string | null;
}

export async function recordManualPayment(
  orderId: string,
  input: ManualPaymentInput,
  actorUserId: string,
  audit: ManualPaymentAudit = {},
) {
  return withTransaction(async (tx) => {
    const order = await orderRepo.lockOrderById(orderId, tx);
    if (!order) throw notFound('Pesanan', orderId);

    const orderStatus = str(order.orderStatus);
    if (ORDER_CLOSED_STATUS.includes(orderStatus)) {
      throw unprocessable(
        `Pesanan berstatus '${orderStatus}' sudah final dan tidak bisa dibayar`,
      );
    }

    const financials = await orderRepo.getOrderFinancials(orderId, tx);
    const totalIdr = orderTotalIdr(financials);
    const paidIdr = await paymentRepo.sumSucceededPayments(orderId, tx);
    const refundedIdr = await paymentRepo.sumRefundedPayments(orderId, tx);
    const outstandingIdr = Math.max(0, totalIdr - paidIdr + refundedIdr);

    if (outstandingIdr <= 0) {
      throw conflict('Pesanan ini sudah lunas');
    }

    const method = input.paymentMethod;
    const requestedAmount = input.amountReceivedIdr;
    const amountReceivedIdr =
      method === 'cash'
        ? roundIdr(requestedAmount ?? outstandingIdr)
        : roundIdr(requestedAmount ?? outstandingIdr);

    if (amountReceivedIdr < outstandingIdr) {
      throw unprocessable(
        `Nominal diterima kurang dari sisa tagihan (${formatIdr(outstandingIdr)})`,
      );
    }

    const changeIdr = Math.max(0, amountReceivedIdr - outstandingIdr);
    const rawProviderData = {
      source: 'kasir',
      amountReceivedIdr,
      changeIdr,
      cashierUserId: actorUserId,
      note: input.note ?? null,
    };

    const inserted = await paymentRepo.insertPayment(
      {
        orderId,
        provider: 'cashier',
        paymentMethod: method,
        idempotencyKey: `manual-${orderId}-${actorUserId}-${Date.now()}`,
        transactionType: TRANSACTION_CHARGE,
        paymentPurpose: 'order',
        amountIdr: outstandingIdr,
        rawProviderData,
      },
      tx,
    );
    const paymentId = str((inserted as unknown as Record<string, unknown> | null)?.id);

    const updated = await paymentRepo.updatePaymentStatus(
      paymentId,
      {
        status: 'succeeded',
        paidAt: new Date(),
        rawProviderData,
      },
      tx,
    );

    await orderRepo.updateOrderStatus(orderId, { paymentStatus: 'paid' }, tx);
    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: orderStatus,
        toStatus: orderStatus,
        changedBy: actorUserId,
        note: `Pembayaran ${method} diterima di kasir`,
      },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.order.payment.manual',
        entityType: 'order',
        entityId: orderId,
        oldData: { paymentStatus: str(order.paymentStatus), paidIdr },
        newData: {
          paymentId,
          paymentMethod: method,
          amountIdr: outstandingIdr,
          amountReceivedIdr,
          changeIdr,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      payment: shapePayment((updated ?? inserted) as Record<string, unknown>),
      order: {
        id: orderId,
        orderStatus,
        paymentStatus: 'paid',
        totalIdr,
        paidIdr: paidIdr + outstandingIdr,
        amountReceivedIdr,
        changeIdr,
      },
    };
  });
}

// --------------------------------------------------------------------------
// GET /payments/:id
// --------------------------------------------------------------------------
export async function getPayment(paymentId: string, userId: string, isStaff: boolean) {
  const payment = await paymentRepo.findPaymentById(paymentId);
  if (!payment) throw notFound('Transaksi pembayaran', paymentId);

  await assertPaymentAccess(payment, userId, isStaff);

  const events = await paymentRepo.listPaymentEvents(paymentId);
  return {
    payment: shapePayment(payment),
    events: events.map((row) => shapePaymentEvent(row, isStaff)),
  };
}

// --------------------------------------------------------------------------
// GET /orders/:orderId/payments
// --------------------------------------------------------------------------
export async function listOrderPayments(
  orderId: string,
  userId: string,
  query: ListOrderPaymentQuery,
): Promise<Paginated<ReturnType<typeof shapePayment>>> {
  const order = await orderRepo.findOrderForUser(orderId, userId);
  if (!order) throw notFound('Pesanan', orderId);

  const paging = parsePagination(query);
  const rows = await paymentRepo.listOrderPayments(orderId, paging, query.status);
  const total = await paymentRepo.countOrderPayments(orderId, query.status);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return { items: rows.map(shapePayment), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /payments/:id/refund
// --------------------------------------------------------------------------
export async function refund(
  userId: string,
  input: RefundRequest,
  isStaff: boolean,
  opts: AuditOptions = {},
): Promise<RefundResult> {
  if (!isStaff) throw forbidden('Hanya staff yang dapat memproses refund');

  const prepared = await withTransaction(async (tx) => {
    // findPaymentForWebhook memakai FOR UPDATE, dipakai juga sebagai lock baris.
    // paymentId diisi, jadi provider dan providerReference tidak dipakai query.
    const locked = await paymentRepo.findPaymentForWebhook('', undefined, input.paymentId, tx);
    if (!locked) throw notFound('Transaksi pembayaran', input.paymentId);
    const payment = locked as Record<string, unknown>;

    if (str(payment.transactionType) !== TRANSACTION_CHARGE) {
      throw unprocessable('Hanya transaksi tipe charge yang bisa direfund');
    }
    if (str(payment.status) !== 'succeeded' && str(payment.status) !== 'partially_refunded') {
      throw unprocessable(
        `Transaksi berstatus '${str(payment.status)}' sehingga belum bisa direfund`,
      );
    }

    const refundedIdr = await sumRefundedForPayment(payment, tx);
    const chargeIdr = toIdr(payment.amountIdr);
    const remainingIdr = Math.max(0, chargeIdr - refundedIdr);
    if (remainingIdr <= 0) throw unprocessable('Transaksi ini sudah direfund penuh');

    const amountIdr = input.amountIdr === undefined ? remainingIdr : toIdr(input.amountIdr);
    if (amountIdr <= 0) throw badRequest('Nominal refund harus lebih besar dari nol');
    if (amountIdr > remainingIdr) {
      throw unprocessable(
        `Nominal refund melebihi sisa yang bisa direfund (sisa ${formatIdr(remainingIdr)})`,
      );
    }

    const purpose: PaymentPurpose = strOrNull(payment.eventBookingId) ? 'event_refund' : 'order';

    const refundRow = await paymentRepo.insertPayment(
      {
        orderId: strOrNull(payment.orderId),
        eventBookingId: strOrNull(payment.eventBookingId),
        provider: str(payment.provider),
        paymentMethod: str(payment.paymentMethod),
        providerReference: null,
        idempotencyKey: null,
        transactionType: TRANSACTION_REFUND,
        paymentPurpose: purpose,
        amountIdr,
        rawProviderData: {
          refundOfPaymentId: str(payment.id),
          refundOfPreviousStatus: str(payment.status),
          reason: input.reason ?? null,
          requestedBy: userId,
        },
      },
      tx,
    );
    if (!refundRow) throw unprocessable('Transaksi refund gagal dibuat, coba lagi');

    // Status transaksi asli langsung ditandai agar dashboard kasir konsisten;
    // Status final tetap dikunci oleh webhook refund.
    const originalStatus = amountIdr >= remainingIdr ? 'refunded' : 'partially_refunded';
    const updatedOriginal = await paymentRepo.updatePaymentStatus(
      str(payment.id),
      { status: originalStatus },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId: userId,
        action: 'payment.refund.create',
        entityType: 'payment_transaction',
        entityId: str(refundRow.id),
        oldData: { status: str(payment.status), refundedIdr },
        newData: { amountIdr, status: 'pending', refundOfPaymentId: str(payment.id), reason: input.reason ?? null },
        requestId: opts.requestId ?? null,
        ipAddress: opts.ipAddress ?? null,
      },
      tx,
    );

    await syncParentPaymentStatus(payment, tx);

    return {
      refund: refundRow as unknown as Record<string, unknown>,
      original: (updatedOriginal ?? payment) as Record<string, unknown>,
      remainingRefundableIdr: Math.max(0, remainingIdr - amountIdr),
    };
  });

  // Panggil gateway refund di luar transaksi.
  const gateway = getPaymentGateway();
  const providerRefund = await gateway.createRefund({
    paymentId: str(prepared.refund.id),
    provider: str(prepared.refund.provider),
    originalProviderReference: strOrNull(prepared.original.providerReference),
    amountIdr: toIdr(prepared.refund.amountIdr),
    currency: str(prepared.refund.currency, CURRENCY),
    reason: input.reason ?? null,
  });

  const updatedRefund = await paymentRepo.updatePaymentStatus(str(prepared.refund.id), {
    providerReference: providerRefund.providerReference,
    rawProviderData: {
      refundOfPaymentId: strOrNull(prepared.original.id),
      refundOfPreviousStatus: strOrNull(prepared.original.status),
      reason: input.reason ?? null,
      requestedBy: userId,
      providerRefundReference: providerRefund.providerReference,
    },
  });

  return {
    refund: shapePayment((updatedRefund ?? prepared.refund) as Record<string, unknown>),
    original: shapePayment(prepared.original),
    outstandingRefundableIdr: prepared.remainingRefundableIdr,
  };
}

/** Total refund yang sudah sukses untuk sebuah transaksi charge. */
async function sumRefundedForPayment(
  charge: Record<string, unknown>,
  tx: TransactionClient,
): Promise<number> {
  const rows = await listSiblingPayments(charge, tx);
  return rows
    .filter(
      (row) =>
        str(row.transactionType) === TRANSACTION_REFUND &&
        str(row.status) === 'succeeded' &&
        strOrNull(refundTargetOf(row)) === str(charge.id),
    )
    .reduce((total, row) => total + toIdr(row.amountIdr), 0);
}

/** Baris refund menyimpan id charge tujuan di raw_provider_data.refundOfPaymentId. */
function refundTargetOf(row: Record<string, unknown>): string | null {
  const raw = row.rawProviderData as Record<string, unknown> | null;
  return raw ? strOrNull(raw.refundOfPaymentId) : null;
}

async function listSiblingPayments(
  parent: Record<string, unknown>,
  tx: TransactionClient,
): Promise<Record<string, unknown>[]> {
  const orderId = strOrNull(parent.orderId);
  if (orderId) {
    return paymentRepo.listOrderPayments(orderId, { limit: SCAN_LIMIT, offset: 0 }, undefined, tx);
  }
  const eventBookingId = strOrNull(parent.eventBookingId);
  if (eventBookingId) {
    return eventRepo.listEventBookingsPayments(eventBookingId, tx);
  }
  return [];
}

/** Selaraskan status pembayaran order / booking event setelah refund dibuat. */
async function syncParentPaymentStatus(
  parent: Record<string, unknown>,
  tx: TransactionClient,
): Promise<string | null> {
  const orderId = strOrNull(parent.orderId);
  if (orderId) {
    const order = await orderRepo.lockOrderById(orderId, tx);
    if (!order) return null;

    const status = calculateParentPaymentStatus(await listSiblingPayments(parent, tx));
    const current = str(order.paymentStatus);
    if (status && current !== status && !ORDER_CLOSED_STATUS.includes(str(order.orderStatus))) {
      await orderRepo.updateOrderStatus(orderId, { paymentStatus: status }, tx);
    }
    return status;
  }

  const eventBookingId = strOrNull(parent.eventBookingId);
  if (eventBookingId) {
    const booking = await eventRepo.findBookingById(eventBookingId, tx);
    return booking ? calculateParentPaymentStatus(await listSiblingPayments(parent, tx)) : null;
  }

  return null;
}

/**
 * Status pembayaran parent dihitung dari agregat baris payment:
 * belum ada refund -> paid; refund penuh -> refunded; selain itu partially_refunded.
 */
function calculateParentPaymentStatus(rows: Record<string, unknown>[]): string | null {
  const chargeIdr = rows
    .filter((row) => str(row.transactionType) === TRANSACTION_CHARGE && str(row.status) === 'succeeded')
    .reduce((total, row) => total + toIdr(row.amountIdr), 0);
  const refundIdr = rows
    .filter((row) => str(row.transactionType) === TRANSACTION_REFUND && str(row.status) === 'succeeded')
    .reduce((total, row) => total + toIdr(row.amountIdr), 0);

  if (chargeIdr <= 0) return refundIdr > 0 ? 'refunded' : null;
  if (refundIdr <= 0) return 'paid';
  return chargeIdr - refundIdr <= 0 ? 'refunded' : 'partially_refunded';
}

// --------------------------------------------------------------------------
// POST /payments/webhook
// --------------------------------------------------------------------------
export async function handleWebhook(
  input: PaymentWebhookInput,
  rawBody: Buffer | string,
  signature: string | null | undefined,
  opts: AuditOptions = {},
): Promise<WebhookResult> {
  // 1. Verifikasi signature SEBELUM menyentuh database.
  if (!verifyWebhookSignature(rawBody, signature ?? '', env.PAYMENT_WEBHOOK_SECRET)) {
    logger.warn(
      { providerEventId: input.providerEventId },
      '[payment:webhook] signature tidak valid',
    );
    throw unauthorized('Signature webhook tidak valid');
  }

  return withTransaction(async (tx) => {
    // 2. Idempotensi inti: provider_event_id UNIQUE di payment_events.
    //    Event yang pernah diproses tidak boleh mengubah data apa pun.
    const alreadyProcessed = await paymentRepo.paymentEventExists(input.providerEventId, tx);
    if (alreadyProcessed) {
      logger.info(
        { providerEventId: input.providerEventId, eventType: input.eventType },
        '[payment:webhook] event duplikat diabaikan',
      );
      return emptyWebhookResult(true);
    }

    const providerReference = resolveProviderReference(input);
    const locked = await paymentRepo.findPaymentForWebhook(
      input.provider,
      providerReference,
      undefined,
      tx,
    );
    if (!locked) throw notFound('Transaksi pembayaran untuk webhook ini');

    const payment = locked as Record<string, unknown>;
    const paymentId = str(payment.id);

    // 3. Audit event. ON CONFLICT DO NOTHING jadi pengaman kedua bila ada
    //    dua webhook dengan provider_event_id sama arrives bersamaan.
    const insertedEvent = await paymentRepo.insertPaymentEvent(
      {
        paymentId,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        payload: input.payload ?? {},
      },
      tx,
    );
    if (!insertedEvent) return emptyWebhookResult(true);

    const eventType = input.eventType.toLowerCase();
    const transactionType = str(payment.transactionType);
    const currentStatus = str(payment.status);
    const targetStatus = resolvePaymentStatus(input);

    // Notifikasi refund yang menunjuk ke transaksi charge tidak mengubah
    // status charge: refund dicatat sebagai baris payment baru tipe refund.
    if (transactionType === TRANSACTION_CHARGE && eventType.includes('refund')) {
      return { duplicated: false, paymentId, paymentStatus: currentStatus, orderStatus: null, bookingStatus: null };
    }

    // Jangan turunkan transaksi yang sudah final.
    if (
      currentStatus === targetStatus ||
      (TERMINAL_PAYMENT_STATUS.includes(currentStatus as PaymentTransactionStatus) &&
        targetStatus !== 'succeeded')
    ) {
      return { duplicated: false, paymentId, paymentStatus: currentStatus, orderStatus: null, bookingStatus: null };
    }

    const paidAt = parseDate(input.paidAt) ?? parseDate(payment.paidAt) ?? new Date();
    await paymentRepo.updatePaymentStatus(paymentId, { status: targetStatus, paidAt }, tx);

    const result: WebhookResult = {
      duplicated: false,
      paymentId,
      paymentStatus: targetStatus,
      orderStatus: null,
      bookingStatus: null,
    };

    if (targetStatus === 'succeeded') {
      if (transactionType === TRANSACTION_REFUND) {
        // Booking event tidak punya kolom status pembayaran, jadi hanya order
        // yang perlu diselaraskan setelah refund berhasil.
        result.orderStatus = await finalizeRefund(payment, tx);
      } else {
        result.orderStatus = await markOrderPaid(payment, tx);
        result.bookingStatus = await confirmEventBookingDeposit(payment, tx);
      }
    } else if (transactionType === TRANSACTION_REFUND) {
      // Refund gagal: kembalikan status transaksi asli seperti sebelum refund diminta.
      await revertOriginalCharge(payment, tx);
    }

    // Status payment gagal/expired/cancelled TIDAK mengubah status order:
    // customer masih boleh mencoba membayar ulang atau membatalkan sendiri.
    await adminRepo.insertAuditLog(
      {
        actorUserId: null,
        action: 'payment.webhook',
        entityType: 'payment_transaction',
        entityId: paymentId,
        oldData: { status: currentStatus },
        newData: {
          status: targetStatus,
          eventType: input.eventType,
          providerEventId: input.providerEventId,
          requestId: opts.requestId ?? null,
        },
        requestId: opts.requestId ?? null,
        ipAddress: opts.ipAddress ?? null,
      },
      tx,
    );

    return result;
  });
}

function emptyWebhookResult(duplicated: boolean): WebhookResult {
  return { duplicated, paymentId: null, paymentStatus: null, orderStatus: null, bookingStatus: null };
}

function resolveProviderReference(input: PaymentWebhookInput): string | undefined {
  if (input.providerReference) return input.providerReference;
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const fromPayload = payload.provider_reference ?? payload.providerReference ?? payload.reference;
  return typeof fromPayload === 'string' && fromPayload.length > 0 ? fromPayload : undefined;
}

/** Mapping status dari provider ke status payment_transactions lokal. */
function resolvePaymentStatus(input: PaymentWebhookInput): PaymentTransactionStatus {
  if (input.status) return input.status;

  const eventType = input.eventType.toLowerCase();
  if (/succeed|success|capture|settlement|settle|paid/.test(eventType)) return 'succeeded';
  if (/expire/.test(eventType)) return 'expired';
  if (/cancel/.test(eventType)) return 'cancelled';
  if (/deny|fail|reject|error/.test(eventType)) return 'failed';
  return 'pending';
}

/**
 * Payment charge sukses: tandai order paid. Status order TIDAK diubah
 * (dari placed ke completed) karena penyelesaian order tetap milik fulfilment,
 * dan status yang sudah berjalan (preparing/ready/out_for_delivery) tidak diturunkan.
 */
async function markOrderPaid(
  payment: Record<string, unknown>,
  tx: TransactionClient,
): Promise<string | null> {
  const orderId = strOrNull(payment.orderId);
  if (!orderId) return null;

  const order = await orderRepo.lockOrderById(orderId, tx);
  if (!order) return null;

  const orderStatus = str(order.orderStatus);
  const paymentStatus = str(order.paymentStatus);
  if (ORDER_CLOSED_STATUS.includes(orderStatus)) return orderStatus;
  if (paymentStatus === 'paid' || paymentStatus === 'partially_refunded' || paymentStatus === 'refunded') {
    return orderStatus;
  }

  await orderRepo.updateOrderStatus(orderId, { paymentStatus: 'paid' }, tx);

  if (orderStatus === 'placed' || orderStatus === 'accepted') {
    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: orderStatus,
        toStatus: orderStatus,
        note: 'Pembayaran diterima (konfirmasi webhook payment gateway)',
      },
      tx,
    );
  }

  return orderStatus;
}

/** Deposit event yang sukses memindahkan booking dari awaiting_deposit ke confirmed. */
async function confirmEventBookingDeposit(
  payment: Record<string, unknown>,
  tx: TransactionClient,
): Promise<string | null> {
  const eventBookingId = strOrNull(payment.eventBookingId);
  if (!eventBookingId) return null;

  const booking = await eventRepo.findBookingById(eventBookingId, tx);
  if (!booking) return null;

  const status = str(booking.status);
  if (str(payment.paymentPurpose) === 'event_deposit' && status === 'awaiting_deposit') {
    await eventRepo.updateBookingStatus(eventBookingId, { status: 'confirmed' }, null, tx);
    return 'confirmed';
  }
  return status;
}

/**
 * Pembayaran DP reservasi sukses: tandai tahap DP `paid` + catat ke riwayat
 * status supaya pelanggan menerima notifikasi pembayaran diterima.
 *
 * Tahap diambil dari kolom `payment_stage` pada transaksi:
 *   deposit (DP1) → `deposit_*`
 *   deposit2      → `deposit2_*`
 *   settlement    → `settlement_*`
 */
async function markReservationDepositPaid(
  payment: Record<string, unknown>,
  tx: TransactionClient,
): Promise<string | null> {
  const reservationId = strOrNull(payment.reservationId);
  if (!reservationId) return null;
  if (str(payment.paymentPurpose) !== 'reservation_deposit') return null;

  const reservation = await reservationRepo.findReservationById(reservationId, tx);
  if (!reservation) return null;

  const stage = strOrNull(payment.paymentStage) ?? 'deposit';
  const prefix: '' | 'deposit2' | 'settlement' =
    stage === 'deposit2' ? 'deposit2' : stage === 'settlement' ? 'settlement' : '';
  const statusField = prefix === '' ? 'depositStatus' : prefix === 'deposit2' ? 'deposit2Status' : 'settlementStatus';

  const currentStage = reservation[statusField] ? String(reservation[statusField]) : 'unpaid';
  if (currentStage === 'paid') return currentStage;

  const amountIdr = toIdr(payment.amountIdr);
  await reservationRepo.updateReservationDepositStage(
    reservationId,
    prefix,
    {
      amountIdr: amountIdr > 0 ? amountIdr : null,
      status: 'paid',
      markPaid: true,
    },
    tx,
  );

  const stageLabel = prefix === '' ? 'DP1' : prefix === 'deposit2' ? 'DP2' : 'Pelunasan';
  const currentStatus = reservation.status ? String(reservation.status) : null;
  await reservationRepo.insertReservationStatusHistory(
    {
      reservationId,
      fromStatus: currentStatus,
      toStatus: currentStatus ?? 'requested',
      note:
        prefix === ''
          ? `${stageLabel} dibayar via Midtrans (Rp${amountIdr.toLocaleString('id-ID')}). Menunggu konfirmasi staff sebelum DP2 dapat dibayar.`
          : `${stageLabel} dibayar via Midtrans (Rp${amountIdr.toLocaleString('id-ID')})`,
      actorUserId: null,
    },
    tx,
  );

  // Catatan: DP1 lunas TIDAK lagi otomatis mengonfirmasi reservasi. Staff harus
  // menekan "Konfirmasi Reservasi" dulu; setelah itu barulah DP2 dapat dibayar.
  return 'paid';
}

/** Refund sukses: status pembayaran order mengikuti agregat refund. */
async function finalizeRefund(
  payment: Record<string, unknown>,
  tx: TransactionClient,
): Promise<string | null> {
  const originalId = refundTargetOf(payment);
  if (!originalId) return null;

  const original = await paymentRepo.findPaymentById(originalId, tx);
  if (!original) return null;

  return syncParentPaymentStatus(original, tx);
}

/** Refund gagal/expired: kembalikan status charge sesuai kondisi sebelum refund diminta. */
async function revertOriginalCharge(
  payment: Record<string, unknown>,
  tx: TransactionClient,
): Promise<void> {
  const originalId = refundTargetOf(payment);
  if (!originalId) return;

  const original = await paymentRepo.findPaymentById(originalId, tx);
  if (!original) return;

  const current = str(original.status);
  if (current !== 'refunded' && current !== 'partially_refunded') return;

  const raw = (payment.rawProviderData ?? null) as Record<string, unknown> | null;
  const previous = strOrNull(raw?.refundOfPreviousStatus) ?? 'succeeded';
  await paymentRepo.updatePaymentStatus(originalId, { status: previous }, tx);
  await syncParentPaymentStatus(original, tx);
}

// --------------------------------------------------------------------------
// GET /payments/:id/verify
// --------------------------------------------------------------------------
export async function verifyPayment(paymentId: string, userId: string) {
  let payment = await paymentRepo.findPaymentById(paymentId);
  if (!payment) throw notFound('Transaksi pembayaran', paymentId);

  await assertPaymentAccess(payment, userId, false);

  // Sinkronkan status dari provider (mis. Midtrans) bila adapter mendukung.
  // Webhook tidak bisa menjangkau localhost saat development, jadi polling
  // lewat endpoint ini yang menyelaraskan status. Transaksi yang sudah final
  // tidak perlu ditanyakan lagi.
  const gateway = getPaymentGateway();
  const currentStatus = str(payment.status) as PaymentTransactionStatus;
  if (gateway.fetchStatus && !TERMINAL_PAYMENT_STATUS.includes(currentStatus)) {
    try {
      const provider = await gateway.fetchStatus(paymentId);
      if (provider && provider.status !== currentStatus) {
        payment = await applyProviderStatus(payment as Record<string, unknown>, provider);
      }
    } catch (error) {
      logger.warn({ err: error, paymentId }, '[payment:verify] sinkronisasi provider gagal');
    }
  }

  const status = str(payment.status);
  return {
    paymentId,
    status,
    isPaid: status === 'succeeded',
    isFinal: TERMINAL_PAYMENT_STATUS.includes(status as PaymentTransactionStatus),
    amountIdr: toIdr(payment.amountIdr),
    transactionType: str(payment.transactionType),
    paymentPurpose: str(payment.paymentPurpose),
    providerReference: strOrNull(payment.providerReference),
    paidAt: iso(payment.paidAt),
    expiresAt: iso(payment.expiresAt),
    orderId: strOrNull(payment.orderId),
    eventBookingId: strOrNull(payment.eventBookingId),
  };
}

/**
 * Terapkan status dari provider ke transaksi lokal + selaraskan order/booking.
 * Idempotent: event disimpan dengan providerEventId deterministik.
 */
async function applyProviderStatus(
  payment: Record<string, unknown>,
  provider: ProviderChargeStatus,
): Promise<Record<string, unknown>> {
  const paymentId = str(payment.id);
  const currentStatus = str(payment.status);

  if (TERMINAL_PAYMENT_STATUS.includes(currentStatus as PaymentTransactionStatus)) {
    return payment;
  }

  return withTransaction(async (tx) => {
    const paidAt = provider.status === 'succeeded' ? new Date() : null;
    const updated = await paymentRepo.updatePaymentStatus(
      paymentId,
      { status: provider.status, paidAt, rawProviderData: provider.raw },
      tx,
    );

    await paymentRepo.insertPaymentEvent(
      {
        paymentId,
        providerEventId: `provider_sync_${provider.transactionId ?? paymentId}_${provider.status}`,
        eventType: `payment.provider_sync.${provider.status}`,
        payload: provider.raw,
      },
      tx,
    );

    if (provider.status === 'succeeded') {
      await markOrderPaid(payment, tx);
      await confirmEventBookingDeposit(payment, tx);
      await markReservationDepositPaid(payment, tx);
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId: null,
        action: 'payment.provider_sync',
        entityType: 'payment_transaction',
        entityId: paymentId,
        oldData: { status: currentStatus },
        newData: { status: provider.status, transactionId: provider.transactionId },
        requestId: null,
        ipAddress: null,
      },
      tx,
    );

    return (updated ?? payment) as Record<string, unknown>;
  });
}

// --------------------------------------------------------------------------
// POST /payments/:id/simulate
// Khusus demo/development: menandai charge lunas tanpa gateway nyata (stub).
// Tidak tersedia di production.
// --------------------------------------------------------------------------
export interface SimulateResult {
  payment: ReturnType<typeof shapePayment>;
  orderStatus: string | null;
  paymentStatus: string;
  alreadyPaid: boolean;
}

export async function simulatePaymentSuccess(
  paymentId: string,
  userId: string,
  opts: AuditOptions = {},
): Promise<SimulateResult> {
  if (env.NODE_ENV === 'production') {
    throw forbidden('Simulasi pembayaran tidak tersedia di production');
  }

  const payment = await paymentRepo.findPaymentById(paymentId);
  if (!payment) throw notFound('Transaksi pembayaran', paymentId);

  await assertPaymentAccess(payment, userId, false);

  const row = payment as Record<string, unknown>;
  const currentStatus = str(row.status);
  if (currentStatus === 'succeeded') {
    return { payment: shapePayment(row), orderStatus: null, paymentStatus: 'succeeded', alreadyPaid: true };
  }
  if (str(row.transactionType) !== TRANSACTION_CHARGE) {
    throw badRequest('Hanya transaksi charge yang bisa disimulasikan lunas');
  }

  const result = await withTransaction(async (tx) => {
    const paidAt = new Date();
    const updated = await paymentRepo.updatePaymentStatus(paymentId, { status: 'succeeded', paidAt }, tx);

    // providerEventId deterministik -> simulasi dobel tidak menggandakan event.
    await paymentRepo.insertPaymentEvent(
      {
        paymentId,
        providerEventId: `simulate_${paymentId}`,
        eventType: 'payment.simulated_success',
        payload: { source: 'app_simulate', paidAt: paidAt.toISOString(), userId },
      },
      tx,
    );

    const orderStatus = await markOrderPaid(row, tx);
    await confirmEventBookingDeposit(row, tx);
    await markReservationDepositPaid(row, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId: userId,
        action: 'payment.simulate',
        entityType: 'payment_transaction',
        entityId: paymentId,
        oldData: { status: currentStatus },
        newData: { status: 'succeeded' },
        requestId: opts.requestId ?? null,
        ipAddress: opts.ipAddress ?? null,
      },
      tx,
    );

    return { updated: (updated as Record<string, unknown> | null) ?? row, orderStatus };
  });

  return {
    payment: shapePayment(result.updated),
    orderStatus: result.orderStatus,
    paymentStatus: 'succeeded',
    alreadyPaid: false,
  };
}