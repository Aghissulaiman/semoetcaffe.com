/**
 * Draf reservasi untuk dibagi antar halaman.
 *
 * Dipakai agar form reservasi (`/reservasi/baru`), halaman pilih menu
 * (`/reservasi/menu`), dan detail produk (`/product/[slug]?mode=reservation`)
 * bisa berbagi pilihan menu & nomor meja tanpa mengoper data besar lewat
 * parameter URL. Hanya hidup selama sesi app.
 */
import { create } from 'zustand';

/** Satu baris pilihan menu: produk + varian/modifier + jumlah. */
export interface MenuPick {
  productId: string;
  /** Varian yang dipilih — server memakai ini untuk menghitung ulang harga. */
  variantId: string;
  name: string;
  priceIdr: number;
  quantity: number;
  /** Nama varian (mis. "Large"); kosong bila produk tanpa varian. */
  variantName?: string;
  /** Opsi modifier terpilih (mis. "Gula 50%"). */
  modifierNames?: string[];
  /** Id opsi modifier terpilih — divalidasi & dihargai ulang di server. */
  modifierOptionIds?: string[];
}

/** Teks ringkas satu pilihan, mis. "Kopi Susu (Large, Gula 50%) x2". */
export function menuPickLabel(pick: MenuPick): string {
  const extras = [pick.variantName, ...(pick.modifierNames ?? [])].filter(Boolean);
  const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
  return `${pick.name}${suffix} x${pick.quantity}`;
}

/**
 * Total harga order menu (makanan/minuman) dari pilihan saat ini.
 *
 * Dipakai untuk estimasi tampilan; harga final ditetapkan server saat
 * reservasi dibuat (harga varian + modifier dihitung ulang di server).
 */
export function menuPicksTotal(picks: MenuPick[]): number {
  return picks.reduce((total, pick) => total + pick.quantity * pick.priceIdr, 0);
}

interface ReservationDraftState {
  /** Menu kafe yang dipilih untuk reservasi. */
  menuPicks: MenuPick[];
  setMenuPicks: (picks: MenuPick[]) => void;
  /** Tambah satu pilihan; baris dengan produk+varian+modifier sama digabung. */
  addMenuPick: (pick: MenuPick) => void;
  /** Kode meja yang dipilih (mis. "IN-01"), dari daftar meja cabang. */
  tableCode: string | null;
  setTableCode: (code: string | null) => void;
  /** Bersihkan draf setelah reservasi terkirim. */
  reset: () => void;
}

function pickKey(pick: MenuPick): string {
  return [
    pick.productId,
    pick.variantId,
    (pick.modifierOptionIds ?? []).slice().sort().join('|'),
  ].join('#');
}

export const useReservationDraftStore = create<ReservationDraftState>((set) => ({
  menuPicks: [],
  setMenuPicks: (picks) => set({ menuPicks: picks }),
  addMenuPick: (pick) =>
    set((state) => {
      const key = pickKey(pick);
      const existing = state.menuPicks.find((item) => pickKey(item) === key);
      if (!existing) return { menuPicks: [...state.menuPicks, pick] };
      return {
        menuPicks: state.menuPicks.map((item) =>
          pickKey(item) === key ? { ...item, quantity: item.quantity + pick.quantity } : item,
        ),
      };
    }),
  tableCode: null,
  setTableCode: (code) => set({ tableCode: code }),
  reset: () => set({ menuPicks: [], tableCode: null }),
}));
