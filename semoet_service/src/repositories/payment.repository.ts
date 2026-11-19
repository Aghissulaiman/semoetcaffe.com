import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const PAYMENT_COLUMNS = `
  pt.id, pt.order_id, pt.event_booking_id, pt.reservation_id, pt.provider,
  pt.payment_method, pt.provider_reference,
  pt.idempotency_key, pt.transaction_type, pt.payment_purpose, pt.payment_stage, pt.status,
  pt.amount_idr, pt.currency, pt.payment_url, pt.expires_at, pt.paid_at,
  pt.raw_provider_data, pt.created_at, pt.updated_at
`;

export interface InsertPaymentInput {
  orderId?: string | null;
  eventBookingId?: string | null;
  reservationId?: string | null;
  provider: string;
  paymentMethod: string;
  providerReference?: string | null;
  idempotencyKey?: string | null;
  transactionType: string;
  paymentPurpose: string;
  /** Tahap DP reservasi: 'deposit' (DP1), 'deposit2', atau 'settlement'. */
  paymentStage?: string | null;
  amountIdr: number;
  paymentUrl?: string | null;
  expiresAt?: Date | null;
  rawProviderData?: Record<string, unknown> | null;
}

export async function insertPayment(input: InsertPaymentInput, executor: Exec = db) {
  return one<{ id: string; status: string }>(
    executor,
    `INSERT INTO payment_transactions AS pt (
        order_id, event_booking_id, reservation_id, provider, payment_method, provider_reference,
        idempotency_key, transaction_type, payment_purpose, payment_stage, status, amount_idr,
        payment_url, expires_at, raw_provider_data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,$14)
     RETURNING ${PAYMENT_COLUMNS}`,
    [
      input.orderId ?? null,
      input.eventBookingId ?? null,
      input.reservationId ?? null,
      input.provider,
      input.paymentMethod,
      input.providerReference ?? null,
      input.idempotencyKey ?? null,
      input.transactionType,
      input.paymentPurpose,
      input.paymentStage ?? null,
      input.amountIdr,
      input.paymentUrl ?? null,
      input.expiresAt ?? null,
      input.rawProviderData ? JSON.stringify(input.rawProviderData) : null,
    ],
  );
}

/** Idempotency: kembalikan transaksi lama bila kunci sama pernah dipakai. */
export async function findPaymentByIdempotencyKey(key: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${PAYMENT_COLUMNS} FROM payment_transactions pt WHERE pt.idempotency_key = $1`,
    [key],
  );
}

export async function findPaymentByProviderReference(provider: string, reference: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${PAYMENT_COLUMNS} FROM payment_transactions pt WHERE pt.provider = $1 AND pt.provider_reference = $2`,
    [provider, reference],
  );
}

export async function findPaymentById(paymentId: string, executor: Exec = db) {
  return one(executor, `SELECT ${PAYMENT_COLUMNS} FROM payment_transactions pt WHERE pt.id = $1`, [paymentId]);
}

/** Dipakai webhook: transaksi pending dari provider_reference mana pun. */
export async function findPaymentForWebhook(
  provider: string,
  providerReference: string | undefined,
  paymentId: string | undefined,
  executor: Exec,
) {
  if (paymentId) {
    return one(
      executor,
      `SELECT ${PAYMENT_COLUMNS} FROM payment_transactions pt WHERE pt.id = $1 FOR UPDATE`,
      [paymentId],
    );
  }
  if (providerReference) {
    return one(
      executor,
      `SELECT ${PAYMENT_COLUMNS} FROM payment_transactions pt
        WHERE pt.provider = $1 AND pt.provider_reference = $2
        FOR UPDATE`,
      [provider, providerReference],
    );
  }
  return null;
}

export async function listOrderPayments(orderId: string, pagination: Paging, status?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${PAYMENT_COLUMNS}
       FROM payment_transactions pt
      WHERE pt.order_id = $1
        AND ($2::text IS NULL OR pt.status = $2)
      ORDER BY pt.created_at DESC
      ${paginationSql(pagination)}`,
    [orderId, status ?? null],
  );
}

export async function countOrderPayments(orderId: string, status?: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM payment_transactions WHERE order_id = $1 AND ($2::text IS NULL OR status = $2)`,
    [orderId, status ?? null],
  );
  return Number(value ?? 0);
}

/**
 * Pemetaan key input ke nama kolom di payment_transactions.
 * Service memakai bentuk camelCase (sama seperti row hasil query), sedangkan
 * kolom di database snake_case. Tanpa pemetaan ini SQL yang terbentuk akan
 * menunjuk kolom yang tidak ada.
 */
const PAYMENT_COLUMN_BY_KEY: Record<string, string> = {
  status: 'status',
  paidAt: 'paid_at',
  paymentUrl: 'payment_url',
  providerReference: 'provider_reference',
  rawProviderData: 'raw_provider_data',
  expiresAt: 'expires_at',
  idempotencyKey: 'idempotency_key',
  orderId: 'order_id',
  eventBookingId: 'event_booking_id',
  amountIdr: 'amount_idr',
};

export async function updatePaymentStatus(
  paymentId: string,
  data: {
    status?: string;
    paidAt?: Date | null;
    paymentUrl?: string | null;
    rawProviderData?: Record<string, unknown> | null;
    providerReference?: string | null;
    expiresAt?: Date | null;
  },
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns
    .map((key, index) => `${PAYMENT_COLUMN_BY_KEY[key] ?? key} = $${index + 2}`)
    .join(', ');
  return one(
    executor,
    `UPDATE payment_transactions AS pt SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING ${PAYMENT_COLUMNS}`,
    [paymentId, ...Object.values(data)],
  );
}

export async function sumSucceededPayments(orderId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COALESCE(SUM(amount_idr), 0)::bigint
       FROM payment_transactions
      WHERE order_id = $1 AND status = 'succeeded' AND transaction_type = 'charge'`,
    [orderId],
  );
  return Number(value ?? 0);
}

export async function sumRefundedPayments(orderId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COALESCE(SUM(amount_idr), 0)::bigint
       FROM payment_transactions
      WHERE order_id = $1 AND status = 'succeeded' AND transaction_type = 'refund'`,
    [orderId],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Payment events (payment_events) - audit webhook, idempotent via provider_event_id
// --------------------------------------------------------------------------
export async function insertPaymentEvent(
  input: {
    paymentId: string;
    providerEventId?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  },
  executor: Exec = db,
) {
  const row = await one<{ id: string }>(
    executor,
    `INSERT INTO payment_events (payment_id, provider_event_id, event_type, payload)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (provider_event_id) DO NOTHING
     RETURNING id`,
    [input.paymentId, input.providerEventId ?? null, input.eventType, JSON.stringify(input.payload)],
  );
  return row;
}

export async function paymentEventExists(providerEventId: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM payment_events WHERE provider_event_id = $1)`,
    [providerEventId],
  );
  return Boolean(value);
}

export async function listPaymentEvents(paymentId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, provider_event_id, event_type, payload, received_at
       FROM payment_events
      WHERE payment_id = $1
      ORDER BY received_at ASC`,
    [paymentId],
  );
}