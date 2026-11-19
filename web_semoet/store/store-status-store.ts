/**
 * Status buka/tutup toko yang dibagikan ke seluruh halaman web pelanggan.
 *
 * AppShell yang mengambil status dari backend (mengikuti cabang keranjang),
 * lalu halaman produk/keranjang/checkout membaca status yang sama untuk
 * menonaktifkan pembelian saat toko tutup.
 */
import { create } from "zustand";

import type { PublicStoreStatus } from "@/types/api";

interface StoreStatusState {
  status: PublicStoreStatus | null;
  setStatus: (status: PublicStoreStatus | null) => void;
}

export const useStoreStatusStore = create<StoreStatusState>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
}));

/** True bila status toko sudah diketahui dan toko sedang tutup. */
export function useStoreClosed(): boolean {
  return useStoreStatusStore((state) =>
    Boolean(state.status && !state.status.isOpen),
  );
}
