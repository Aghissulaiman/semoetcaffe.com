/**
 * Helper perhitungan DP reservasi untuk panel admin.
 *
 * Rumus harus sama persis dengan backend (`semoet_service`) supaya nominal
 * yang tampil di dashboard, form kelola, dan pop-up konfirmasi tidak pernah
 * berbeda. Persentase & batas nominal bisa diatur admin di halaman
 * "Ketentuan DP" (default: DP1 30%, min Rp300.000, max Rp500.000, DP2 30%).
 *
 * "Total" di sini = sewa ruangan + order menu (makanan/minuman), jadi uang
 * muka ikut menutup makanan & minuman yang dipesan pelanggan.
 */

import type { AdminReservation, DepositSettings } from "@/types/api";

/** Bagian pengaturan DP yang dipakai untuk menghitung nominal. */
export type DepositTerms = Pick<
  DepositSettings,
  "dp1Percent" | "dp1MinIdr" | "dp1MaxIdr" | "dp2Percent"
>;

/** Nilai bawaan (rumus lama) — dipakai bila pengaturan belum dimuat. */
export const DEFAULT_DEPOSIT_TERMS: DepositTerms = {
  dp1Percent: 30,
  dp1MinIdr: 300_000,
  dp1MaxIdr: 500_000,
  dp2Percent: 30,
};

export const DEPOSIT1_PERCENT = DEFAULT_DEPOSIT_TERMS.dp1Percent;
export const DEPOSIT1_MIN_IDR = DEFAULT_DEPOSIT_TERMS.dp1MinIdr;
export const DEPOSIT1_MAX_IDR = DEFAULT_DEPOSIT_TERMS.dp1MaxIdr;
export const DEPOSIT2_PERCENT = DEFAULT_DEPOSIT_TERMS.dp2Percent;

/** Tahap pembayaran DP pada sebuah reservasi. */
export type DepositStageKey = "deposit" | "deposit2" | "settlement";

export const DEPOSIT_STAGE_LABEL: Record<DepositStageKey, string> = {
  deposit: "DP1 · Uang Muka Awal",
  deposit2: "DP2 · Setelah Konfirmasi",
  settlement: "Pelunasan",
};

export const DEPOSIT_STAGE_SHORT: Record<DepositStageKey, string> = {
  deposit: "DP1",
  deposit2: "DP2",
  settlement: "Pelunasan",
};

export interface DepositStages {
  total: number;
  deposit1: number;
  deposit2: number;
  settlement: number;
}

/** Hitung ketiga nominal DP dari total (rumus sama dengan backend). */
export function depositStages(
  totalEstimateIdr: number | null | undefined,
  terms: DepositTerms = DEFAULT_DEPOSIT_TERMS,
): DepositStages {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const dp1PercentOf = Math.round(total * (Number(terms.dp1Percent) / 100));
  // DP1 dijepit di rentang min–max yang diatur admin.
  let deposit1 = Math.min(
    Number(terms.dp1MaxIdr),
    Math.max(Number(terms.dp1MinIdr), dp1PercentOf),
  );
  // Tidak pernah melebihi total.
  if (deposit1 > total) deposit1 = total;
  const remainingAfterDp1 = Math.max(0, total - deposit1);
  const deposit2 = Math.round(remainingAfterDp1 * (Number(terms.dp2Percent) / 100));
  const settlement = Math.max(0, remainingAfterDp1 - deposit2);
  return { total, deposit1, deposit2, settlement };
}

/** Cara DP1 ditetapkan: nilai minimum, persentase, atau nilai maksimum. */
export type Deposit1Basis = "min" | "rate" | "max";

export interface Deposit1Rule {
  amountIdr: number;
  basis: Deposit1Basis;
  /** Label singkat, mis. "DP1 Rp300.000 (minimum)". */
  label: string;
  /** Penjelasan aturan yang dipakai. */
  note: string;
}

/**
 * Jelaskan aturan harga DP1 untuk sebuah total (sewa + menu), supaya admin
 * tahu kenapa nominalnya Rp300.000 atau Rp500.000.
 */
export function describeDeposit1(
  totalEstimateIdr: number | null | undefined,
  terms: DepositTerms = DEFAULT_DEPOSIT_TERMS,
): Deposit1Rule {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const { deposit1 } = depositStages(total, terms);
  const percent = Number(terms.dp1Percent);
  const percentOf = Math.round(total * (percent / 100));
  const min = `Rp${Number(terms.dp1MinIdr).toLocaleString("id-ID")}`;
  const max = `Rp${Number(terms.dp1MaxIdr).toLocaleString("id-ID")}`;

  if (total <= 0) {
    return {
      amountIdr: deposit1,
      basis: "min",
      label: `DP1 ${min}`,
      note: `Total belum dihitung. DP1 dihitung otomatis: ${percent}% dari total (sewa + menu), minimal ${min}, maksimal ${max}.`,
    };
  }
  if (percentOf >= Number(terms.dp1MaxIdr)) {
    return {
      amountIdr: deposit1,
      basis: "max",
      label: `DP1 ${max} (maksimum)`,
      note: `${percent}% dari total (sewa + menu) (Rp${percentOf.toLocaleString("id-ID")}) melewati batas maximum, jadi DP1 dibatasi di ${max}.`,
    };
  }
  if (percentOf >= Number(terms.dp1MinIdr)) {
    return {
      amountIdr: deposit1,
      basis: "rate",
      label: `DP1 Rp${deposit1.toLocaleString("id-ID")} (${percent}% dari total)`,
      note: `DP1 = ${percent}% dari total (sewa + menu) (masih di antara ${min} dan ${max}).`,
    };
  }
  return {
    amountIdr: deposit1,
    basis: "min",
    label: `DP1 ${min} (minimum)`,
    note: `${percent}% dari total (sewa + menu) (Rp${percentOf.toLocaleString("id-ID")}) di bawah ${min}, jadi DP1 memakai nilai minimum ${min}.`,
  };
}

/** Data satu tahap DP pada baris reservasi admin. */
export interface StageInfo {
  amountIdr: number | null;
  status: string;
  proofUrl: string | null;
  paidAt: string | null;
  note: string | null;
}

/** Ambil data satu tahap DP (DP1/DP2/Pelunasan) dari baris reservasi. */
export function stageInfo(
  row: Pick<
    AdminReservation,
    | "depositAmountIdr"
    | "depositStatus"
    | "depositProofUrl"
    | "depositPaidAt"
    | "depositNote"
    | "deposit2AmountIdr"
    | "deposit2Status"
    | "deposit2ProofUrl"
    | "deposit2PaidAt"
    | "deposit2Note"
    | "settlementAmountIdr"
    | "settlementStatus"
    | "settlementProofUrl"
    | "settlementPaidAt"
    | "settlementNote"
  >,
  stage: DepositStageKey,
): StageInfo {
  if (stage === "deposit2") {
    return {
      amountIdr: row.deposit2AmountIdr,
      status: row.deposit2Status,
      proofUrl: row.deposit2ProofUrl,
      paidAt: row.deposit2PaidAt,
      note: row.deposit2Note,
    };
  }
  if (stage === "settlement") {
    return {
      amountIdr: row.settlementAmountIdr,
      status: row.settlementStatus,
      proofUrl: row.settlementProofUrl,
      paidAt: row.settlementPaidAt,
      note: row.settlementNote,
    };
  }
  return {
    amountIdr: row.depositAmountIdr,
    status: row.depositStatus,
    proofUrl: row.depositProofUrl,
    paidAt: row.depositPaidAt,
    note: row.depositNote,
  };
}

/**
 * Nominal satu tahap DP: pakai nominal tersimpan bila ada (supaya reservasi
 * lama tidak berubah saat ketentuan DP diperbarui), selain itu hitung dari
 * total memakai ketentuan aktif.
 */
export function stageAmount(
  row: Pick<AdminReservation, "totalEstimateIdr"> & Parameters<typeof stageInfo>[0],
  stage: DepositStageKey,
  terms: DepositTerms = DEFAULT_DEPOSIT_TERMS,
): number {
  const stored = stageInfo(row, stage).amountIdr;
  if (stored != null && Number(stored) > 0) return Number(stored);
  const stages = depositStages(row.totalEstimateIdr, terms);
  if (stage === "deposit") return stages.deposit1;
  if (stage === "deposit2") return stages.deposit2;
  return stages.settlement;
}

/** Berapa yang sudah benar-benar lunas dari tiga tahap DP. */
export function paidAmount(
  row: Pick<
    AdminReservation,
    | "depositAmountIdr"
    | "depositStatus"
    | "deposit2AmountIdr"
    | "deposit2Status"
    | "settlementAmountIdr"
    | "settlementStatus"
  >,
): number {
  const paid = (amount: number | null, status: string) =>
    status === "paid" ? Number(amount ?? 0) : 0;
  return (
    paid(row.depositAmountIdr, row.depositStatus) +
    paid(row.deposit2AmountIdr, row.deposit2Status) +
    paid(row.settlementAmountIdr, row.settlementStatus)
  );
}

/** Sisa tagihan yang belum dibayar pelanggan. */
export function remainingAmount(
  row: Pick<AdminReservation, "totalEstimateIdr"> &
    Parameters<typeof paidAmount>[0],
): number {
  return Math.max(0, (row.totalEstimateIdr ?? 0) - paidAmount(row));
}

/** Status reservasi yang sudah final (tidak bisa diubah lagi). */
export function isFinalStatus(status: string): boolean {
  return status === "completed" || status === "cancelled" || status === "no_show";
}
