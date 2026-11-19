"use client";

import AppModal from "@/components/common/AppModal";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatNumber } from "@/lib/format";
import { stockDocumentStatusLabel, stockDocumentStatusTone } from "@/lib/labels";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { StockOpnameDocument, StockOpnameItem } from "@/types/api";

interface StockOpnameDetailModalProps {
  document: StockOpnameDocument;
  items: StockOpnameItem[];
  onClose: () => void;
  onPost: (document: StockOpnameDocument) => void;
  onCancel: (document: StockOpnameDocument) => void;
}

export default function StockOpnameDetailModal({
  document,
  items,
  onClose,
  onPost,
  onCancel,
}: StockOpnameDetailModalProps) {
  const draft = document.status === "draft";

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={`Stok Opname ${document.number}`}
      desc={`${document.stockLocationName ?? "—"} · ${formatDate(document.opnameDate)}`}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg border border-coffee-linen px-4 py-2 text-theme-sm font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5">
            Tutup
          </button>
          {draft && (
            <>
              <button type="button" onClick={() => onCancel(document)} className="rounded-lg border border-coffee-linen px-4 py-2 text-theme-sm font-semibold text-coffee-warning transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5">
                Batalkan
              </button>
              <button type="button" onClick={() => onPost(document)} className="rounded-lg bg-coffee-brown px-4 py-2 text-theme-sm font-semibold text-coffee-milk transition-colors hover:bg-coffee-espresso dark:bg-coffee-caramel dark:text-coffee-night">
                Posting
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className={tdClass}>
            <p className="text-theme-xs text-coffee-muted">Status</p>
            <div className="mt-1">
              <ToneBadge tone={stockDocumentStatusTone(document.status)}>
                {stockDocumentStatusLabel(document.status)}
              </ToneBadge>
            </div>
          </div>
          <div className={tdClass}>
            <p className="text-theme-xs text-coffee-muted">Tanggal</p>
            <p className="mt-1 font-medium text-coffee-dark dark:text-coffee-cream">{formatDate(document.opnameDate)}</p>
          </div>
          <div className={tdClass}>
            <p className="text-theme-xs text-coffee-muted">Bahan</p>
            <p className="mt-1 font-medium text-coffee-dark dark:text-coffee-cream">{formatNumber(document.itemCount)}</p>
          </div>
          <div className={tdClass}>
            <p className="text-theme-xs text-coffee-muted">Selisih</p>
            <p className="mt-1 font-medium text-coffee-dark dark:text-coffee-cream">{formatNumber(document.totalDifference)}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
          <table className="min-w-full">
            <thead>
              <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
                <th className={`${thClass} text-start`}>Bahan</th>
                <th className={`${thClass} text-end`}>Saldo Sistem</th>
                <th className={`${thClass} text-end`}>Jumlah Fisik</th>
                <th className={`${thClass} text-end`}>Selisih</th>
                <th className={`${thClass} text-start`}>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={trClass}>
                  <td className={`${tdClass} text-coffee-dark dark:text-coffee-cream/80`}>
                    <span className="block font-medium">{item.ingredientName ?? "—"}</span>
                    <span className="block font-mono text-theme-xs text-coffee-muted">{item.ingredientSku ?? "-"}</span>
                  </td>
                  <td className={`${tdClass} text-end`}>{formatNumber(item.systemQuantity)}</td>
                  <td className={`${tdClass} text-end`}>{formatNumber(item.countedQuantity)}</td>
                  <td
                    className={`${tdClass} text-end font-semibold ${item.differenceQuantity > 0 ? "text-coffee-success" : item.differenceQuantity < 0 ? "text-coffee-danger" : "text-coffee-muted"}`}
                  >
                    {item.differenceQuantity > 0 ? `+${formatNumber(item.differenceQuantity)}` : formatNumber(item.differenceQuantity)}
                  </td>
                  <td className={`${tdClass} text-start text-coffee-muted`}>{item.notes ?? "—"}</td>
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
