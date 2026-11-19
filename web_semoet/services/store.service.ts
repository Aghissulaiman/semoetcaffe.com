/** Endpoint /api/v1/store/status — status buka/tutup toko untuk pelanggan. */
import { api } from './client';

import type { PublicStoreStatus } from '@/types/api';

export function getStoreStatus(branchId?: string): Promise<PublicStoreStatus> {
  return api<PublicStoreStatus>('/store/status', {
    query: { branchId },
    auth: false,
  });
}
