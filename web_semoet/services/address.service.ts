/** Endpoint /api/v1/me/addresses — alamat pengantaran milik user. */
import { api, request } from './client';

import type { Address, Paginated } from '@/types/api';

export interface CreateAddressPayload {
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  addressDetail?: string;
  city: string;
  province?: string;
  postalCode?: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
}

export async function listAddresses(): Promise<Address[]> {
  const res = await request<Address[]>('/me/addresses', { query: { limit: 50 }, auth: true });
  return res.data;
}

export function createAddress(payload: CreateAddressPayload): Promise<Address> {
  return api<Address>('/me/addresses', { method: 'POST', body: payload, auth: true });
}

export function deleteAddress(id: string): Promise<void> {
  return api(`/me/addresses/${id}`, { method: 'DELETE', auth: true });
}

export function setDefaultAddress(id: string): Promise<Address> {
  return api<Address>(`/me/addresses/${id}/default`, { method: 'PATCH', auth: true });
}

export type { Address };
export type { Paginated };
