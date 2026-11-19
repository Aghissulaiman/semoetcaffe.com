/** Endpoint /api/v1/me/points & /loyalty — poin dan hadiah loyalitas. */
import { api, request } from './client';

import type { LoyaltyRedemption, LoyaltyReward, Paginated, PointHistoryEntry, PointsSummary } from '@/types/api';

export function getPoints(): Promise<PointsSummary> {
  return api<PointsSummary>('/me/points', { auth: true });
}

export async function listPointsHistory(page = 1, limit = 20): Promise<Paginated<PointHistoryEntry>> {
  const res = await request<PointHistoryEntry[]>('/me/points/history', {
    query: { page, limit },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export async function listRewards(): Promise<LoyaltyReward[]> {
  const res = await request<LoyaltyReward[]>('/loyalty/rewards', { query: { limit: 50 }, auth: true });
  return res.data;
}

export function redeemReward(rewardId: string): Promise<LoyaltyRedemption> {
  return api<LoyaltyRedemption>('/loyalty/redeem', {
    method: 'POST',
    body: { rewardId },
    auth: true,
  });
}

export async function listRedemptions(page = 1, limit = 20): Promise<Paginated<LoyaltyRedemption>> {
  const res = await request<LoyaltyRedemption[]>('/me/redemptions', { query: { page, limit }, auth: true });
  return { items: res.data, meta: res.meta };
}
