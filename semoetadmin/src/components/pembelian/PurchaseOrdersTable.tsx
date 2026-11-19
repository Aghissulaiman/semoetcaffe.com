"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatIdr, formatNumber } from "@/lib/format";
import {
  purchaseOrderStatusLabel,
  purchaseOrderStatusTone,
  purchasePaymentStatusLabel,
  purchasePaymentStatusTone,
} from "@/lib/labels";
import type { PurchaseOrder } from "@/types/api";

interface PurchaseOrdersTableProps {
  orders: PurchaseOrder[];
  onSelect: (order: PurchaseOrder) => void;
}

export default function PurchaseOrdersTable({ orders, onSelect }: PurchaseOrdersTableProps) {
  const columns: Column<PurchaseOrder>[] = [
    {
      key: "number",
      header: "Nomor PO",
      render: (row) => (
        <div>
          <p className="font-semibold text-coffee-dark dark:text-coffee-cream">{row.number}</p>
          <p className="text-theme-xs text-coffee-muted">{formatDate(row.orderDate)}</p>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (row) => (
        <div>
          <p className="font-medium text-coffee-dark dark:text-coffee-cream">
            {row.supplierName ?? "—"}
          </p>
          <p className="text-theme-xs text-coffee-muted">
            {row.supplierCode ?? "—"}
            {row.branchName ? ` · ${row.branchName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "items",
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
      key: "totalIdr",
      header: "Total",
      align: "right",
      render: (row) => (
        <div>
          <p className="font-semibold">{formatIdr(row.totalIdr)}</p>
          {row.outstandingIdr > 0 && (
            <p className="text-theme-xs text-coffee-danger">
              Sisa {formatIdr(row.outstandingIdr)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Dokumen",
      render: (row) => (
        <ToneBadge tone={purchaseOrderStatusTone(row.status)}>
          {purchaseOrderStatusLabel(row.status)}
        </ToneBadge>
      ),
    },
    {
      key: "paymentStatus",
      header: "Pembayaran",
      render: (row) => (
        <ToneBadge tone={purchasePaymentStatusTone(row.paymentStatus)}>
          {purchasePaymentStatusLabel(row.paymentStatus)}
        </ToneBadge>
      ),
    },
    {
      key: "dates",
      header: "Tiba / Tempo",
      render: (row) => (
        <div>
          <p>{row.expectedDate ? formatDate(row.expectedDate) : "—"}</p>
          {row.dueDate && (
            <p className="text-theme-xs text-coffee-muted">Tempo: {formatDate(row.dueDate)}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={orders}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada purchase order"
      onRowClick={onSelect}
    />
  );
}
