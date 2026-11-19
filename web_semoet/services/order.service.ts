/** Endpoint /api/v1/orders & /me/orders — pesanan pelanggan. */
import { api, request } from './client';

import type { CreateOrderPayload, OrderDetail, OrderSummary, Paginated } from '@/types/api';

export type OrderStatusFilter =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export interface ListMyOrdersParams {
  page?: number;
  limit?: number;
  orderStatus?: OrderStatusFilter;
  sort?: 'recent' | 'oldest' | 'total_desc';
}

export async function listMyOrders(params: ListMyOrdersParams = {}): Promise<Paginated<OrderSummary>> {
  const res = await request<OrderSummary[]>('/me/orders', {
    query: { limit: 20, ...params },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function createOrder(payload: CreateOrderPayload, idempotencyKey: string): Promise<OrderDetail> {
  return api<OrderDetail>('/orders', {
    method: 'POST',
    body: payload,
    idempotencyKey,
    auth: true,
  });
}

export function getOrderDetail(id: string): Promise<OrderDetail> {
  return api<OrderDetail>(`/orders/${id}`, { auth: true });
}

export function cancelOrder(id: string, reason: string): Promise<OrderSummary> {
  return api<OrderSummary>(`/orders/${id}/cancel`, {
    method: 'POST',
    body: { reason, requestRefund: true },
    auth: true,
  });
}
