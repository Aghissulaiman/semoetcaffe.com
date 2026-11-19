"use client";

import AppModal from "@/components/common/AppModal";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatNumber } from "@/lib/format";
import { stockDocumentStatusLabel, stockDocumentStatusTone } from "@/lib/labels";
import { secondaryButtonClass } from "@/lib/ui";
import type { StockOutDocument, StockOutItem } from "@/types/api";
import { cn } from "@/utils";

interface StockOutDetailModalProps {
  document: StockOutDocument;
  items: StockOutItem[];
  onClose: () => void;
  onPost: (document: StockOutDocument) => void;
  onCancel: (document: StockOutDocument) => void;
}

export default function StockOutDetailModal({
  document,
  items,
  onClose,
  onPost,
  onCancel,
}: StockOutDetailModalProps) {
  const draft = document.status === "draft";

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={`Stok Keluar ${document.number}`}
      desc={`Dari ${document.fromLocationName ?? "—"} ke ${document.toLocationName ?? "—"} · ${formatDate(document.transferDate)}`}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Tutup
          </button>
          {draft && (
            <>
              <button
                type="button"
                onClick={() => onCancel(document)}
                className="rounded-lg border border-coffee-linen px-4 py-2 text-theme-sm font-semibold text-coffee-warning transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => onPost(document)}
                className="rounded-lg bg-coffee-brown px-4 py-2 text-theme-sm font-semibold text-coffee-milk transition-colors hover:bg-coffee-espresso dark:bg-coffee-caramel dark:text-coffee-night"
              >
                Posting
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
            <p className="text-theme-xs text-coffee-muted">Status</p>
            <div className="mt-1">
              <ToneBadge tone={stockDocumentStatusTone(document.status)}>
                {stockDocumentStatusLabel(document.status)}
              </ToneBadge>
            </div>
          </div>
          <div className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
            <p className="text-theme-xs text-coffee-muted">Tanggal</p>
            <p className="mt-1 font-medium text-coffee-dark dark:text-coffee-cream">
              {formatDate(document.transferDate)}
            </p>
          </div>
          <div className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
            <p className="text-theme-xs text-coffee-muted">Total Bahan</p>
            <p className="mt-1 font-medium text-coffee-dark dark:text-coffee-cream">
              {formatNumber(document.itemCount)} item · {formatNumber(document.totalQuantity)} qty
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
          <table className="min-w-full">
            <thead>
              <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
                <th className="px-4 py-3 text-start text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                  Bahan
                </th>
                <th className="px-4 py-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                  Jumlah
                </th>
                <th className="px-4 py-3 text-start text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                  Catatan
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b border-coffee-linen/70 last:border-0 dark:border-coffee-night-border/70",
                  )}
                >
                  <td className="px-4 py-3 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                    <span className="block font-medium">{item.ingredientName ?? "—"}</span>
                    <span className="block font-mono text-theme-xs text-coffee-muted">
                      {item.ingredientSku ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-coffee-danger">
                    {formatNumber(item.quantity)}
                    {item.baseUnit ? ` ${item.baseUnit}` : ""}
                  </td>
                  <td className="px-4 py-3 text-theme-xs text-coffee-muted">{item.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {document.notes && (
          <p className="rounded-xl border border-coffee-linen p-3 text-theme-sm text-coffee-dark dark:border-coffee-night-border dark:text-coffee-cream/80">
            <span className="font-semibold">Catatan dokumen: </span>
            {document.notes}
          </p>
        )}
      </div>
    </AppModal>
  );
}
