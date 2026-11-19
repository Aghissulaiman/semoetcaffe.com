"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRupiah } from "@/lib/format";

import type { UserVoucher } from "@/types/api";

interface VoucherCardProps {
  voucher: UserVoucher;
  onUse?: () => void;
}

const STATUS_TONE: Record<UserVoucher["status"], "success" | "warning" | "default" | "danger"> = {
  available: "success",
  reserved: "warning",
  used: "default",
  expired: "default",
  revoked: "danger",
};

const STATUS_LABEL: Record<UserVoucher["status"], string> = {
  available: "Siap dipakai",
  reserved: "Dipesan",
  used: "Terpakai",
  expired: "Kedaluwarsa",
  revoked: "Dicabut",
};

function discountLabel(voucher: UserVoucher): string {
  const promo = voucher.promo;
  if (!promo) return "Voucher";
  if (promo.discountType === "percentage") {
    const cap = promo.maximumDiscountIdr
      ? ` (maks ${formatRupiah(promo.maximumDiscountIdr)})`
      : "";
    return `${promo.discountValue}% diskon${cap}`;
  }
  if (promo.discountType === "fixed") return `${formatRupiah(promo.discountValue)} diskon`;
  return "Bonus gratis item";
}

/** Kartu voucher milik user. */
export function VoucherCard({ voucher, onUse }: VoucherCardProps) {
  const usable = voucher.status === "available";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2.5 bg-primary-soft px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-primary">
            {voucher.promo?.name ?? voucher.code ?? "Voucher"}
          </p>
          <p className="text-xs text-primary/80">{discountLabel(voucher)}</p>
        </div>
        <Badge label={STATUS_LABEL[voucher.status]} tone={STATUS_TONE[voucher.status]} size="sm" />
      </div>

      <div className="flex flex-col gap-1 p-3.5">
        {voucher.code ? (
          <p className="text-xs font-bold tracking-[1px] text-muted">Kode: {voucher.code}</p>
        ) : null}
        <p className="text-xs text-muted">
          Berlaku s/d {voucher.expiresAt ? formatDate(voucher.expiresAt) : "tanpa batas"}
        </p>
        {usable && onUse ? (
          <Button
            title="Pakai voucher"
            size="sm"
            variant="soft"
            fullWidth={false}
            onClick={onUse}
            className="mt-2"
          />
        ) : null}
      </div>
    </div>
  );
}
