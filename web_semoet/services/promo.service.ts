/** Endpoint /api/v1/promos & /me/vouchers — promo publik dan voucher milik user. */
import { api, request } from './client';

import type { Paginated, PromoCampaign, UserVoucher } from '@/types/api';

export async function listPromos(page = 1, limit = 20): Promise<Paginated<PromoCampaign>> {
  const res = await request<PromoCampaign[]>('/promos', {
    query: { page, limit, currentlyValid: true },
    auth: false,
  });
  return { items: res.data, meta: res.meta };
}

export function getPromoByCode(code: string): Promise<PromoCampaign> {
  return api<PromoCampaign>(`/promos/${encodeURIComponent(code)}`, { auth: false });
}

export async function listVouchers(
  params: { page?: number; limit?: number; status?: string } = {},
): Promise<Paginated<UserVoucher>> {
  const res = await request<UserVoucher[]>('/me/vouchers', {
    query: { limit: 20, ...params },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function claimVoucher(code: string): Promise<UserVoucher> {
  return api<UserVoucher>('/me/vouchers/claim', {
    method: 'POST',
    body: { code },
    auth: true,
  });
}

export interface VoucherValidation {
  isValid: boolean;
  discountIdr: number;
  message?: string;
  voucherId?: string;
}

export function validateVoucher(input: {
  code?: string;
  voucherId?: string;
  subtotalIdr: number;
  productIds?: string[];
  branchId?: string;
}): Promise<VoucherValidation> {
  return api<VoucherValidation>('/me/vouchers/validate', {
    method: 'POST',
    body: { ...input, productIds: input.productIds ?? [] },
    auth: true,
  });
}
