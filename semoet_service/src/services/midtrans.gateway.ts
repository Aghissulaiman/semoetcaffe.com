import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { PaymentTransactionStatus } from '../config/constants.js';
import { ServiceUnavailableError, unprocessable } from '../errors/AppError.js';
import type {
  PaymentChargeRequest,
  PaymentChargeResult,
  PaymentGateway,
  PaymentInstructions,
  PaymentRefundRequest,
  PaymentRefundResult,
  ProviderChargeStatus,
} from './paymentGateway.provider.js';

/**
 * Adapter Midtrans (Snap).
 *
 * Charge dibuat lewat Snap `/snap/v1/transactions` yang mengembalikan
 * `redirect_url` — inilah halaman pembayaran Midtrans yang dibuka app.
 * Status disinkronkan lewat Core API `/v2/{order_id}/status` (dipakai saat
 * app menekan "Cek status"), karena webhook Midtrans tidak bisa menjangkau
 * localhost saat development.
 *
 * `order_id` yang dikirim ke Midtrans = id transaksi lokal (paymentId), jadi
 * pemetaan webhook/status cukup memakai id itu.
 */

const REQUEST_TIMEOUT_MS = 20_000;
/** Masa berlaku halaman pembayaran Midtrans (menit). */
const EXPIRY_MINUTES = 60;

function snapBaseUrl(): string {
  return env.MIDTRANS_IS_PRODUCTION ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
}

function coreApiBaseUrl(): string {
  return env.MIDTRANS_IS_PRODUCTION ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
}

function authHeader(): string {
  const token = Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function midtransRequest<T>(
  url: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authHeader(),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const text = await response.text();
    const json = (text ? JSON.parse(text) : null) as Record<string, unknown> | null;

    if (!response.ok) {
      const messages = (json?.error_messages as string[] | undefined)?.join(', ');
      logger.error(
        { status: response.status, body: json, url },
        '[payment:midtrans] permintaan ditolak',
      );
      throw unprocessable(
        `Pembayaran gagal dibuat di Midtrans${messages ? `: ${messages}` : ''}`,
      );
    }

    return (json ?? {}) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceUnavailableError('Gateway pembayaran tidak merespons (timeout)');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function channelOf(paymentMethod: string): PaymentInstructions['channel'] {
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

/** Batasi metode di halaman Snap sesuai pilihan user (kosong = semua). */
function enabledPayments(paymentMethod: string): string[] | undefined {
  switch (paymentMethod) {
    case 'virtual_account':
    case 'bank_transfer':
      return ['bank_transfer'];
    case 'ewallet':
      return ['gopay', 'shopeepay'];
    case 'card':
      return ['credit_card'];
    // qris: biarkan Snap menampilkan pilihan QRIS yang tersedia.
    default:
      return undefined;
  }
}

/** Normalisasi status Midtrans -> status lokal. */
export function normalizeMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string,
): PaymentTransactionStatus {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'challenge' ? 'pending' : 'succeeded';
    case 'settlement':
      return 'succeeded';
    case 'pending':
      return 'pending';
    case 'deny':
      return 'failed';
    case 'cancel':
      return 'cancelled';
    case 'expire':
      return 'expired';
    case 'refund':
    case 'partial_refund':
      return 'succeeded';
    default:
      return 'pending';
  }
}

export const midtransPaymentGateway: PaymentGateway = {
  name: 'midtrans',

  async createCharge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
    const paymentType = enabledPayments(request.paymentMethod);

    const body: Record<string, unknown> = {
      transaction_details: {
        order_id: request.paymentId,
        gross_amount: Math.round(request.amountIdr),
      },
      expiry: { unit: 'minutes', duration: EXPIRY_MINUTES },
      ...(paymentType ? { enabled_payments: paymentType } : {}),
      ...(request.idempotencyKey ? { custom_field1: request.idempotencyKey.slice(0, 255) } : {}),
    };

    const snap = await midtransRequest<{ token?: string; redirect_url?: string }>(
      `${snapBaseUrl()}/snap/v1/transactions`,
      { method: 'POST', body },
    );

    if (!snap.redirect_url) {
      throw new ServiceUnavailableError('Midtrans tidak mengembalikan halaman pembayaran');
    }

    const channel = channelOf(request.paymentMethod);
    const instructions: PaymentInstructions = {
      method: request.paymentMethod,
      channel,
      reference: snap.token ?? request.paymentId,
      amountIdr: Math.round(request.amountIdr),
      currency: request.currency,
      expiresAt: expiresAt.toISOString(),
      paymentUrl: snap.redirect_url,
      qrString: null,
      virtualAccountNumber: null,
      steps: [
        'Halaman pembayaran Midtrans akan terbuka.',
        'Pilih metode pembayaran dan selesaikan transaksi.',
        'Setelah selesai, kembali ke aplikasi lalu tekan "Cek status pembayaran".',
      ],
    };

    return {
      // order_id Midtrans = id transaksi lokal, dipakai untuk cek status/refund.
      providerReference: request.paymentId,
      expiresAt,
      instructions,
    };
  },

  async createRefund(request: PaymentRefundRequest): Promise<PaymentRefundResult> {
    const refundKey = `refund_${randomUUID()}`;
    // order_id Midtrans = id transaksi charge asli (lihat createCharge).
    const midtransOrderId = request.originalProviderReference ?? request.paymentId;
    await midtransRequest(
      `${coreApiBaseUrl()}/v2/${encodeURIComponent(midtransOrderId)}/refund`,
      {
        method: 'POST',
        body: {
          refund_key: refundKey,
          amount: Math.round(request.amountIdr),
          reason: request.reason ?? 'Refund dari Semoet Cafe',
        },
      },
    );
    return { providerReference: refundKey };
  },

  async fetchStatus(orderId: string): Promise<ProviderChargeStatus | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${coreApiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json', Authorization: authHeader() },
        },
      );

      // 404 = transaksi belum/tidak ada di Midtrans (mis. belum dibayar atau
      // kedaluwarsa). Perlakukan sebagai "belum ada status", bukan error.
      if (response.status === 404) return null;

      const text = await response.text();
      const json = (text ? JSON.parse(text) : null) as Record<string, unknown> | null;
      if (!response.ok || !json) {
        logger.warn(
          { status: response.status, body: json, orderId },
          '[payment:midtrans] gagal mengambil status',
        );
        return null;
      }

      const transactionStatus =
        typeof json.transaction_status === 'string' ? json.transaction_status : '';
      if (!transactionStatus) return null;

      const fraudStatus = typeof json.fraud_status === 'string' ? json.fraud_status : undefined;
      return {
        status: normalizeMidtransStatus(transactionStatus, fraudStatus),
        transactionId: typeof json.transaction_id === 'string' ? json.transaction_id : null,
        raw: json,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn({ orderId }, '[payment:midtrans] timeout mengambil status');
        return null;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },
};
