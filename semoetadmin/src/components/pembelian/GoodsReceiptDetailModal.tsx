"use client";

import AppModal from "@/components/common/AppModal";
import { ErrorBlock, LoadingBlock } from "@/components/common/DataState";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { formatDate, formatDateTime, formatIdr, formatNumber } from "@/lib/format";
import { goodsReceiptStatusLabel, goodsReceiptStatusTone } from "@/lib/labels";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { GoodsReceiptDetail } from "@/types/api";

interface GoodsReceiptDetailModalProps {
  receiptId: string;
  onClose: () => void;
  onPost?: () => void;
}

/** Rincian dokumen penerimaan barang beserta bahan yang masuk. */
export default function GoodsReceiptDetailModal({
  receiptId,
  onClose,
  onPost,
}: GoodsReceiptDetailModalProps) {
  const detail = useApi<GoodsReceiptDetail>(`/admin/goods-receipts/${receiptId}`);
  const receipt = detail.data?.receipt;

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Detail Penerimaan"
      desc={receipt ? `${receipt.number} · PO ${receipt.purchaseOrderNumber ?? "—"}` : undefined}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Tutup
          </button>
          {receipt?.status === "draft" && onPost && (
            <button type="button" onClick={onPost} className={primaryButtonClass}>
              Posting ke Stok
            </button>
          )}
        </>
      }
    >
      {detail.loading && !detail.data ? (
        <LoadingBlock />
      ) : detail.error ? (
        <ErrorBlock message={detail.error} onRetry={detail.reload} />
      ) : receipt ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-coffee-linen p-4 sm:grid-cols-2 dark:border-coffee-night-border">
            <Row label="Supplier" value={receipt.supplierName ?? "—"} />
            <Row label="Lokasi Stok" value={receipt.stockLocationName ?? "—"} />
            <Row label="Tanggal Terima" value={formatDate(receipt.receivedDate)} />
            <Row
              label="Status"
              value={
                <ToneBadge tone={goodsReceiptStatusTone(receipt.status)}>
                  {goodsReceiptStatusLabel(receipt.status)}
                </ToneBadge>
              }
            />
            <Row
              label="Diposting"
              value={
                receipt.postedAt
                  ? `${formatDateTime(receipt.postedAt)}${receipt.postedByName ? ` · ${receipt.postedByName}` : ""}`
                  : "Belum diposting"
              }
            />
            {receipt.notes && <Row label="Catatan" value={receipt.notes} />}
          </div>

          <div>
            <p className="mb-2 text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
              Bahan Diterima
            </p>
            <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
                    <th className="px-4 py-2 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                      Bahan
                    </th>
                    <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                      Diterima
                    </th>
                    <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                      Dipesan
                    </th>
                    <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                      Harga Satuan
                    </th>
                    <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.data?.items ?? []).map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-coffee-linen/50 last:border-0 dark:border-coffee-night-border/50"
                    >
                      <td className="px-4 py-2 text-theme-sm">
                        <p className="font-medium text-coffee-dark dark:text-coffee-cream">
                          {item.ingredientName}
                        </p>
                        <p className="text-theme-xs text-coffee-muted">{item.ingredientSku}</p>
                      </td>
                      <td className="px-4 py-2 text-end text-theme-sm">
                        {formatNumber(item.quantity)} {item.baseUnit}
                      </td>
                      <td className="px-4 py-2 text-end text-theme-sm text-coffee-muted">
                        {formatNumber(item.orderedQuantity)} {item.baseUnit}
                      </td>
                      <td className="px-4 py-2 text-end text-theme-sm">
                        {formatIdr(item.unitPriceIdr)}
                      </td>
                      <td className="px-4 py-2 text-end text-theme-sm font-semibold">
                        {formatIdr(Math.round(item.quantity * item.unitPriceIdr))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between rounded-xl bg-coffee-milk/40 px-4 py-3 text-theme-sm dark:bg-white/5">
            <span className="text-coffee-muted">Total nilai penerimaan</span>
            <span className="font-semibold text-coffee-brown dark:text-coffee-caramel">
              {formatIdr(receipt.totalValueIdr)}
            </span>
          </div>
        </div>
      ) : null}
    </AppModal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-theme-xs text-coffee-muted">{label}</span>
      <span className="text-end text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream">
        {value}
      </span>
    </div>
  );
}
