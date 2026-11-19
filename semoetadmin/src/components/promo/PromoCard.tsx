import ToneBadge from "@/components/common/ToneBadge";
import { PencilIcon, TrashBinIcon } from "@/icons";
import { formatDate, formatIdr, formatNumber } from "@/lib/format";
import { discountTypeLabel } from "@/lib/labels";
import type { Promo } from "@/types/api";

interface PromoCardProps {
  promo: Promo;
  onEdit?: (promo: Promo) => void;
  onDelete?: (promo: Promo) => void;
}

/** Nilai diskon dalam teks ringkas. */
function discountText(promo: Promo): string {
  if (promo.discountType === "percentage") return `${promo.discountValue}%`;
  if (promo.discountType === "fixed") {
    return promo.mode === "direct"
      ? `${formatIdr(promo.discountValue)} / menu`
      : formatIdr(promo.discountValue);
  }
  return "Item Gratis";
}

export default function PromoCard({ promo, onEdit, onDelete }: PromoCardProps) {
  const now = new Date().getTime();
  const starts = new Date(promo.startsAt).getTime();
  const ends = new Date(promo.endsAt).getTime();
  const isRunning = promo.isActive && now >= starts && now <= ends;
  const isExpired = now > ends;
  const isDirect = promo.mode === "direct" || !promo.code;

  return (
    <div className="flex flex-col rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isDirect
                  ? "bg-coffee-caramel/15 text-coffee-brown dark:text-coffee-caramel"
                  : "bg-coffee-brown/10 text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel"
              }`}
            >
              {isDirect ? "Diskon Menu" : "Kode Voucher"}
            </span>
          </div>
          <p className="truncate text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            {promo.name}
          </p>
          {promo.code ? (
            <p className="font-mono text-theme-xs text-coffee-muted">{promo.code}</p>
          ) : (
            <p className="text-theme-xs text-coffee-muted">Otomatis di menu</p>
          )}
        </div>
        {isExpired ? (
          <ToneBadge tone="muted">Berakhir</ToneBadge>
        ) : isRunning ? (
          <ToneBadge tone="success">Berjalan</ToneBadge>
        ) : promo.isActive ? (
          <ToneBadge tone="warning">Terjadwal</ToneBadge>
        ) : (
          <ToneBadge tone="muted">Nonaktif</ToneBadge>
        )}
      </div>

      <p className="mt-4 text-2xl font-bold text-coffee-brown dark:text-coffee-caramel">
        {discountText(promo)}
      </p>
      <p className="text-theme-xs text-coffee-muted">{discountTypeLabel(promo.discountType)}</p>

      {promo.description && (
        <p className="mt-2 line-clamp-2 text-theme-xs text-coffee-muted">{promo.description}</p>
      )}

      <dl className="mt-4 space-y-1.5 border-t border-dashed border-coffee-linen pt-4 text-theme-xs dark:border-coffee-night-border">
        {!isDirect && (
          <Row
            label="Min. Belanja"
            value={promo.minimumOrderIdr ? formatIdr(promo.minimumOrderIdr) : "Tanpa minimum"}
          />
        )}
        {promo.maximumDiscountIdr !== null && (
          <Row
            label={isDirect ? "Maks. Diskon / Menu" : "Maks. Diskon"}
            value={formatIdr(promo.maximumDiscountIdr)}
          />
        )}
        <Row
          label="Kuota / Pengguna"
          value={promo.perUserQuota !== null ? formatNumber(promo.perUserQuota) : "Tak terbatas"}
        />
        <Row label="Periode" value={`${formatDate(promo.startsAt)} – ${formatDate(promo.endsAt)}`} />
        <Row label="Terpakai" value={`${formatNumber(promo.totalRedeemed)} kali`} />
      </dl>

      {(onEdit || onDelete) && (
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-coffee-linen pt-4 dark:border-coffee-night-border">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(promo)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
            >
              <PencilIcon className="h-3.5 w-3.5" /> Ubah
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(promo)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10"
            >
              <TrashBinIcon className="h-3.5 w-3.5" /> Hapus
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-coffee-muted">{label}</dt>
      <dd className="text-end font-medium text-coffee-dark dark:text-coffee-cream/80">{value}</dd>
    </div>
  );
}
