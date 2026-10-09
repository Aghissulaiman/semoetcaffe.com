import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { PaymentTransactionStatus } from '../config/constants.js';
import { roundIdr } from '../utils/money.js';
import { midtransPaymentGateway } from './midtrans.gateway.js';

/**
 * Adapter payment gateway.
 *
 * Tujuannya: service payment tidak pernah bicara langsung ke SDK provider,
 * hanya ke interface di bawah ini. Stub dipakai bila kredensial provider belum
 * diisi; bila `MIDTRANS_SERVER_KEY` tersedia, adapter Midtrans yang dipakai.
 */

export interface PaymentChargeRequest {
  paymentId: string;
  provider: string;
  paymentMethod: string;
  amountIdr: number;
  currency: string;
  paymentPurpose: string;
  orderId?: string | null;
  eventBookingId?: string | null;
  idempotencyKey?: string | null;
}

/** Instruksi pembayaran yang dikirim ke aplikasi (QRIS / virtual account / dsb). */
export interface PaymentInstructions {
  method: string;
  channel: 'qris' | 'virtual_account' | 'bank_transfer' | 'ewallet' | 'card' | 'cash';
  reference: string;
  amountIdr: number;
  currency: string;
  expiresAt: string | null;
  paymentUrl: string | null;
  qrString: string | null;
  virtualAccountNumber: string | null;
  steps: string[];
}

export interface PaymentChargeResult {
  providerReference: string;
  expiresAt: Date | null;
  instructions: PaymentInstructions;
}

export interface PaymentRefundRequest {
  paymentId: string;
  provider: string;
  originalProviderReference: string | null;
  amountIdr: number;
  currency: string;
  reason?: string | null;
}

export interface PaymentRefundResult {
  providerReference: string;
}

/** Status transaksi menurut provider, dinormalisasi ke status lokal. */
export interface ProviderChargeStatus {
  status: PaymentTransactionStatus;
  transactionId: string | null;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  /** Nama adapter, dipakai untuk audit/log. */
  readonly name: string;
  createCharge(request: PaymentChargeRequest): Promise<PaymentChargeResult>;
  createRefund(request: PaymentRefundRequest): Promise<PaymentRefundResult>;
  /** Sinkronisasi status dari provider (opsional). `orderId` = id transaksi lokal. */
  fetchStatus?(orderId: string): Promise<ProviderChargeStatus | null>;
}

/** Masa berlaku instruksi placeholder. */
const STUB_EXPIRY_MINUTES = 30;

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

function buildStubSteps(channel: PaymentInstructions['channel'], providerReference: string): string[] {
  switch (channel) {
    case 'qris':
      return [
        'Buka aplikasi e-wallet atau mobile banking Anda.',
        'Pindai QRIS yang ditampilkan pada aplikasi Semoet Cafe.',
        'Pastikan nominal sesuai dengan total tagihan.',
        `Status pembayaran otomatis diperbarui lewat notifikasi provider (${providerReference}).`,
      ];
    case 'virtual_account':
      return [
        'Virtual account dibuat otomatis atas nama Anda.',
        'Lakukan transfer tepat sesuai nominal tagihan.',
        'Tidak perlu mengonfirmasi manual: pembayaran terdeteksi otomatis lewat webhook provider.',
      ];
    case 'bank_transfer':
      return [
        'Transfer ke rekening yang ditampilkan pada instruksi pembayaran.',
        'Cantumkan nomor pesanan sebagai berita transfer.',
      ];
    case 'ewallet':
    case 'card':
      return [
        'Lanjutkan pembayaran pada halaman pembayaran provider.',
        'Selesaikan autentikasi sesuai permintaan provider.',
      ];
    default:
      return [
        'Bayar langsung di kasir cabang atau kurir saat pesanan diterima.',
        'Pesanan akan diperbarui setelah pembayaran dikonfirmasi kasir.',
      ];
  }
}

function buildStubInstructions(
  request: PaymentChargeRequest,
  providerReference: string,
  expiresAt: Date | null,
): PaymentInstructions {
  const channel = channelOf(request.paymentMethod);
  const amountIdr = roundIdr(request.amountIdr);
  const qrString =
    channel === 'qris'
      ? `stub-qris://pay?ref=${encodeURIComponent(providerReference)}&amount=${amountIdr}`
      : null;
  const virtualAccountNumber =
    channel === 'virtual_account' || channel === 'bank_transfer'
      ? `8808${String(amountIdr).padStart(10, '0').slice(-10)}`
      : null;

  return {
    method: request.paymentMethod,
    channel,
    reference: providerReference,
    amountIdr,
    currency: request.currency,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    // Stub tidak punya halaman pembayaran nyata. Jangan kembalikan URL ke host
    // palsu (mis. stub-gateway.local) karena app akan membuka browser yang
    // menggantung tanpa henti. Instruksi (qrString/VA/steps) ditampilkan in-app.
    paymentUrl: null,
    qrString,
    virtualAccountNumber,
    steps: buildStubSteps(channel, providerReference),
  };
}

/**
 * Gateway sementara. Tidak memanggil layanan eksternal apa pun; semua
 * reference berawalan `stub_` supaya jelas data simulasi dan mudah dibedakan
 * dari transaksi sungguhan saat integrasi provider selesai.
 */
export const stubPaymentGateway: PaymentGateway = {
  name: 'stub',

  async createCharge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const providerReference = `stub_charge_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + STUB_EXPIRY_MINUTES * 60 * 1000);
    return {
      providerReference,
      expiresAt,
      instructions: buildStubInstructions(request, providerReference, expiresAt),
    };
  },

  async createRefund(_request: PaymentRefundRequest): Promise<PaymentRefundResult> {
    return { providerReference: `stub_refund_${randomUUID()}` };
  },

  async fetchStatus(): Promise<ProviderChargeStatus | null> {
    return null;
  },
};

let warned = false;

/**
 * Mengembalikan adapter gateway yang aktif.
 * - `MIDTRANS_SERVER_KEY` terisi -> adapter Midtrans (sandbox/production).
 * - selain itu -> stub (tanpa panggilan eksternal), warning sekali per proses.
 */
export function getPaymentGateway(): PaymentGateway {
  if (env.MIDTRANS_SERVER_KEY.trim().length > 0) {
    return midtransPaymentGateway;
  }
  if (!warned) {
    warned = true;
    logger.warn(
      { provider: env.PAYMENT_PROVIDER_DEFAULT },
      '[payment] MIDTRANS_SERVER_KEY belum diisi, memakai stub gateway',
    );
  }
  return stubPaymentGateway;
}