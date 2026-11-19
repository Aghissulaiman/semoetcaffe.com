"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatNumber } from "@/lib/format";
import { stockDocumentStatusLabel, stockDocumentStatusTone } from "@/lib/labels";
import type { StockOpnameDocument } from "@/types/api";

interface StockOpnameTableProps {
  documents: StockOpnameDocument[];
  onSelect: (document: StockOpnameDocument) => void;
  onPost: (document: StockOpnameDocument) => void;
  onCancel: (document: StockOpnameDocument) => void;
  onDelete: (document: StockOpnameDocument) => void;
}

export default function StockOpnameTable({
  documents,
  onSelect,
  onPost,
  onCancel,
  onDelete,
}: StockOpnameTableProps) {
  const columns: Column<StockOpnameDocument>[] = [
    {
      key: "number",
      header: "Nomor Dokumen",
      render: (row) => (
        <div>
          <p className="font-semibold text-coffee-dark dark:text-coffee-cream">{row.number}</p>
          <p className="text-theme-xs text-coffee-muted">{formatDate(row.opnameDate)}</p>
        </div>
      ),
    },
    {
      key: "stockLocation",
      header: "Lokasi Stok",
      render: (row) => (
        <div>
          <p className="font-medium text-coffee-dark dark:text-coffee-cream">
            {row.stockLocationName ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "items",
      header: "Bahan",
      render: (row) => (
        <div>
          <p>{formatNumber(row.itemCount)} item</p>
          <p className="text-theme-xs text-coffee-muted">
            Surplus {formatNumber(row.surplusCount)} · Defisit {formatNumber(row.defectCount)}
          </p>
        </div>
      ),
    },
    {
      key: "difference",
      header: "Selisih",
      align: "right",
      render: (row) => (
        <span className="font-semibold text-coffee-warning">{formatNumber(row.totalDifference)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <ToneBadge tone={stockDocumentStatusTone(row.status)}>
          {stockDocumentStatusLabel(row.status)}
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
            className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5"
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
              className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5 text-coffee-brown dark:text-coffee-caramel"
              onClick={(event) => {
                event.stopPropagation();
                onPost(row);
              }}
            >
              Posting
            </button>
          )}
          {row.status === "draft" && (
            <button
              type="button"
              className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5 text-coffee-warning"
              onClick={(event) => {
                event.stopPropagation();
                onCancel(row);
              }}
            >
              Batalkan
            </button>
          )}
          {row.status === "draft" && (
            <button
              type="button"
              className="rounded-lg border border-coffee-danger/30 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(row);
              }}
            >
              Hapus
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={documents}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada dokumen stok opname"
      onRowClick={onSelect}
    />
  );
}
