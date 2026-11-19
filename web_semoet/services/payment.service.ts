/** Endpoint /api/v1/payments — charge untuk pesanan. */
import { api, request } from './client';

import type {
  ChargeResult,
  PaymentMethod,
  PaymentTransaction,
  Paginated,
  SimulatePaymentResult,
  VerifyPaymentResult,
} from '@/types/api';

export function chargeOrder(
  orderId: string,
  paymentMethod: PaymentMethod,
  idempotencyKey?: string,
): Promise<ChargeResult> {
  return api<ChargeResult>('/payments/charge', {
    method: 'POST',
    body: { orderId, paymentMethod, paymentPurpose: 'order' },
    idempotencyKey,
    auth: true,
    timeoutMs: 15000, // timeout khusus payment 15 detik
  });
}

export function getPayment(id: string): Promise<PaymentTransaction> {
  return api<PaymentTransaction>(`/payments/${id}`, { auth: true });
}

/**
 * Menandai pembayaran lunas tanpa gateway nyata (khusus demo/development).
 * Backend menolak di production.
 */
export function simulatePaymentSuccess(paymentId: string): Promise<SimulatePaymentResult> {
  return api<SimulatePaymentResult>(`/payments/${paymentId}/simulate`, { method: 'POST', auth: true });
}

/** Sinkronkan status transaksi dengan gateway (mis. Midtrans) lalu kembalikan status terbaru. */
export function verifyPayment(paymentId: string): Promise<VerifyPaymentResult> {
  return api<VerifyPaymentResult>(`/payments/${paymentId}/verify`, { auth: true });
}

export async function listOrderPayments(orderId: string): Promise<Paginated<PaymentTransaction>> {
  const res = await request<PaymentTransaction[]>(`/orders/${orderId}/payments`, {
    query: { limit: 10 },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}
