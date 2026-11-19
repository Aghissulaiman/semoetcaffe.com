"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatIdr, formatNumber } from "@/lib/format";
import { goodsReceiptStatusLabel, goodsReceiptStatusTone } from "@/lib/labels";
import type { GoodsReceipt } from "@/types/api";

interface GoodsReceiptsTableProps {
  receipts: GoodsReceipt[];
  onSelect: (receipt: GoodsReceipt) => void;
  onPost: (receipt: GoodsReceipt) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5";

export default function GoodsReceiptsTable({
  receipts,
  onSelect,
  onPost,
}: GoodsReceiptsTableProps) {
  const columns: Column<GoodsReceipt>[] = [
    {
      key: "number",
      header: "Nomor Penerimaan",
      render: (row) => (
        <div>
          <p className="font-semibold text-coffee-dark dark:text-coffee-cream">{row.number}</p>
          <p className="text-theme-xs text-coffee-muted">{formatDate(row.receivedDate)}</p>
        </div>
      ),
    },
    {
      key: "purchaseOrderNumber",
      header: "Referensi PO",
      render: (row) => (
        <div>
          <p className="font-medium text-coffee-dark dark:text-coffee-cream">
            {row.purchaseOrderNumber ?? "—"}
          </p>
          <p className="text-theme-xs text-coffee-muted">{row.supplierName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "stockLocationName",
      header: "Lokasi Stok",
      render: (row) => (
        <div>
          <p>{row.stockLocationName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "totalQuantity",
      header: "Bahan",
      align: "right",
      render: (row) => (
        <div>
          <p>{formatNumber(row.itemCount)} item</p>
          <p className="text-theme-xs text-coffee-muted">{formatNumber(row.totalQuantity)} qty</p>
        </div>
      ),
    },
    {
      key: "totalValueIdr",
      header: "Nilai",
      align: "right",
      render: (row) => formatIdr(row.totalValueIdr),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <ToneBadge tone={goodsReceiptStatusTone(row.status)}>
          {goodsReceiptStatusLabel(row.status)}
        </ToneBadge>
      ),
    },
    {
      key: "actions",
      header: "Aksi",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={actionButtonClass}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(row);
            }}
          >
            Lihat
          </button>
          {row.status === "draft" && (
            <button
              type="button"
              className={`${actionButtonClass} text-coffee-brown dark:text-coffee-caramel`}
              onClick={(event) => {
                event.stopPropagation();
                onPost(row);
              }}
            >
              Posting
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={receipts}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada dokumen penerimaan"
      onRowClick={onSelect}
    />
  );
}
