/** Endpoint /api/v1/branches — cabang & meja. */
import { api, request } from './client';

import type { Branch, DiningArea } from '@/types/api';

export interface CafeTable {
  id: string;
  areaId: string;
  areaName: string;
  tableCode: string;
  capacity: number;
  isActive: boolean;
}

export async function listBranches(params: { page?: number; limit?: number; isOpenNow?: boolean } = {}): Promise<Branch[]> {
  const res = await request<Branch[]>('/branches', { query: { limit: 20, ...params }, auth: false });
  return res.data;
}

export function getBranch(id: string): Promise<Branch> {
  return api<Branch>(`/branches/${id}`, { auth: false });
}

/** Area tempat duduk (umbrella, beanbag, indoor, dst.) pada satu cabang. */
export async function listBranchAreas(branchId: string, isActive = true): Promise<DiningArea[]> {
  const res = await request<DiningArea[]>(`/branches/${branchId}/areas`, {
    query: { isActive },
    auth: false,
  });
  return res.data;
}

export async function listBranchTables(branchId: string): Promise<CafeTable[]> {
  const res = await request<CafeTable[]>(`/branches/${branchId}/tables`, { auth: false });
  return res.data;
}
