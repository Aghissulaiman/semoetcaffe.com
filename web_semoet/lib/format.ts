/** Util formatting & label untuk tampilan sisi user. */

import type { OrderStatus, PaymentStatus } from '@/types/api';

/** 25000 -> "Rp25.000" */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Rp0';
  return `Rp${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** "2026-01-05T10:00:00Z" -> "5 Jan 2026, 10.00" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Jam singkat WIB: "18.00". */
export function formatTimeWib(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

/** Label zona waktu Indonesia yang ramah pengguna. */
export function timezoneLabel(timeZone: string | null | undefined): string {
  if (!timeZone) return '';
  if (timeZone === 'Asia/Jakarta') return 'WIB';
  if (timeZone === 'Asia/Makassar') return 'WITA';
  if (timeZone === 'Asia/Jayapura') return 'WIT';
  return timeZone;
}

/**
 * Jam buka berikutnya dalam bahasa sehari-hari:
 * "pukul 09.00", "besok pukul 09.00", atau "Sen, 16 Nov pukul 09.00".
 */
export function formatStoreNextOpen(
  iso: string | null | undefined,
  timeZone = 'Asia/Jakarta',
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  const day = date.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  });
  const now = new Date();
  const today = now.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString(
    'id-ID',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone },
  );

  if (day === today) return `pukul ${time}`;
  if (day === tomorrow) return `besok pukul ${time}`;
  return `${day} pukul ${time}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Diterima',
  accepted: 'Dikonfirmasi',
  preparing: 'Disiapkan',
  ready: 'Siap diambil',
  out_for_delivery: 'Dalam perjalanan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  rejected: 'Ditolak',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  placed: 'info',
  accepted: 'info',
  preparing: 'warning',
  ready: 'success',
  out_for_delivery: 'info',
  completed: 'success',
  cancelled: 'danger',
  rejected: 'danger',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Belum dibayar',
  pending: 'Menunggu pembayaran',
  paid: 'Lunas',
  partially_refunded: 'Sebagian direfund',
  refunded: 'Direfund',
  failed: 'Gagal',
};

export const FULFILLMENT_LABEL: Record<string, string> = {
  delivery: 'Antar',
  pickup: 'Ambil sendiri',
  dine_in: 'Makan di tempat',
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  requested: 'Menunggu konfirmasi',
  confirmed: 'Dikonfirmasi',
  seated: 'Sudah duduk',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  no_show: 'Tidak hadir',
};

export const RESERVATION_STATUS_TONE: Record<
  string,
  'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
  requested: 'warning',
  confirmed: 'success',
  seated: 'info',
  completed: 'default',
  cancelled: 'danger',
  no_show: 'danger',
};

/** Label Bahasa Indonesia untuk tipe area tempat duduk. */
export const AREA_TYPE_LABEL: Record<string, string> = {
  indoor: 'Dalam ruangan',
  outdoor: 'Luar ruangan',
  private_room: 'Ruang privat',
  other: 'Area lain',
};

/** Label status pembayaran uang muka (DP). */
export const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Belum bayar',
  pending: 'Menunggu pembayaran',
  paid: 'Lunas',
  refunded: 'Dikembalikan',
};

export const DEPOSIT_STATUS_TONE: Record<
  string,
  'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
  unpaid: 'default',
  pending: 'warning',
  paid: 'success',
  refunded: 'danger',
};

/** Ketentuan DP (3 tahap) yang ditampilkan di form & detail reservasi. */
export const DEPOSIT_TERMS = {
  /** DP1: 30% dari total sewa, dijepit Rp300.000–500.000. */
  dp1Percent: 30,
  dp1MinIdr: 300000,
  dp1MaxIdr: 500000,
  /** DP2: 30% dari sisa setelah DP1, setelah reservasi dikonfirmasi staff. */
  dp2Percent: 30,
  /** Pelunasan: sisa total setelah DP1 + DP2. */
  settlementLabel: 'Pelunasan',
} as const;

/**
 * Hitung ketiga nominal DP dari total — rumus yang sama dengan backend.
 * Total = sewa ruangan + order menu (makanan/minuman), jadi uang muka ikut
 * menutup makanan & minuman yang dipesan.
 *   DP1 = clamp(30% × total, 300.000, 500.000) — hanya boleh melebihi total
 *          bila total < 300.000 (reservasi sangat murah)
 *   Sisa = total − DP1
 *   DP2 = 30% × sisa (setelah DP1)
 *   Pelunasan = max(0, sisa − DP2)
 */
export function computeDepositStages(totalEstimateIdr: number): {
  deposit1: number;
  deposit2: number;
  settlement: number;
} {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const dp1PercentOf = Math.round(total * (DEPOSIT_TERMS.dp1Percent / 100));
  // DP1 selalu di rentang Rp300.000–Rp500.000: 30% yang di bawah minimum
  // memakai nilai minimum, yang di atas maximum memakai nilai maximum.
  let deposit1 = Math.min(
    DEPOSIT_TERMS.dp1MaxIdr,
    Math.max(DEPOSIT_TERMS.dp1MinIdr, dp1PercentOf),
  );
  // Tidak pernah melebihi total sewa.
  if (deposit1 > total) deposit1 = total;
  const remainingAfterDp1 = Math.max(0, total - deposit1);
  const deposit2 = Math.round(remainingAfterDp1 * (DEPOSIT_TERMS.dp2Percent / 100));
  const settlement = Math.max(0, remainingAfterDp1 - deposit2);
  return { deposit1, deposit2, settlement };
}

/** Cara DP1 ditetapkan sistem: nilai minimum, persentase, atau nilai maximum. */
export type Deposit1Basis = 'min' | 'rate' | 'max';

/**
 * Penjelasan aturan harga DP1 untuk sebuah total (sewa + menu) — supaya
 * pelanggan tahu kenapa nominalnya Rp300.000 atau Rp500.000.
 *
 *   total < Rp1.000.000         → DP1 = Rp300.000 (minimum)
 *   Rp1.000.000 – Rp1.666.666   → DP1 = 30% × total
 *   total > Rp1.666.666         → DP1 = Rp500.000 (maximum)
 */
export function describeDeposit1(totalEstimateIdr: number): {
  amountIdr: number;
  basis: Deposit1Basis;
  /** Label singkat, mis. "DP1 Rp300.000 (minimum)". */
  label: string;
  /** Penjelasan lengkap aturan yang dipakai. */
  note: string;
} {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const { deposit1 } = computeDepositStages(total);
  const percentOf = Math.round(total * (DEPOSIT_TERMS.dp1Percent / 100));
  const min = formatRupiah(DEPOSIT_TERMS.dp1MinIdr);
  const max = formatRupiah(DEPOSIT_TERMS.dp1MaxIdr);

  if (total <= 0) {
    return {
      amountIdr: deposit1,
      basis: 'min',
      label: `DP1 ${min}`,
      note: `Total belum dihitung. DP1 dihitung otomatis: ${DEPOSIT_TERMS.dp1Percent}% dari total (sewa + menu), minimal ${min}, maksimal ${max}.`,
    };
  }
  if (percentOf >= DEPOSIT_TERMS.dp1MaxIdr) {
    return {
      amountIdr: deposit1,
      basis: 'max',
      label: `DP1 ${max} (maksimum)`,
      note: `30% dari total (sewa + menu) (${formatRupiah(percentOf)}) melewati batas maximum, jadi DP1 dibatasi di ${max}.`,
    };
  }
  if (percentOf >= DEPOSIT_TERMS.dp1MinIdr) {
    return {
      amountIdr: deposit1,
      basis: 'rate',
      label: `DP1 ${formatRupiah(deposit1)} (${DEPOSIT_TERMS.dp1Percent}% dari total)`,
      note: `DP1 = ${DEPOSIT_TERMS.dp1Percent}% dari total (sewa + menu) (masih di antara ${min} dan ${max}).`,
    };
  }
  return {
    amountIdr: deposit1,
    basis: 'min',
    label: `DP1 ${min} (minimum)`,
    note: `30% dari total (sewa + menu) (${formatRupiah(percentOf)}) di bawah ${min}, jadi DP1 memakai nilai minimum ${min}.`,
  };
}

/** Label tiap tahap DP. */
export const DEPOSIT_STAGE_LABEL = {
  deposit: 'DP1 · Uang muka awal',
  deposit2: 'DP2 · Setelah konfirmasi',
  settlement: 'Pelunasan',
} as const;

/** Label tipe area dengan fallback aman untuk nilai tak dikenal. */
export function areaTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return AREA_TYPE_LABEL[type] ?? 'Area';
}

/** Tanggal + jam singkat untuk jadwal reservasi: "Sab, 25 Okt 2026 · 18.00". */
export function formatReservationSchedule(iso: string | null | undefined): string {
  if (!iso) return 'Jadwal belum ditentukan';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Jadwal belum ditentukan';
  const day = date.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Hasil rata-rata rating untuk ditampilkan (1 angka desimal). */
export function averageRating(values: (number | null | undefined)[]): number | null {
  const filled = values.filter((v): v is number => typeof v === 'number');
  if (filled.length === 0) return null;
  return filled.reduce((sum, v) => sum + v, 0) / filled.length;
}
