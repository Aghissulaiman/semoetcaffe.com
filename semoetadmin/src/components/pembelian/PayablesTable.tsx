"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatIdr } from "@/lib/format";
import {
  purchaseOrderStatusLabel,
  purchaseOrderStatusTone,
  purchasePaymentStatusLabel,
  purchasePaymentStatusTone,
} from "@/lib/labels";
import type { Payable } from "@/types/api";

interface PayablesTableProps {
  payables: Payable[];
  onPay: (payable: Payable) => void;
  onSelect: (payable: Payable) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5";

export default function PayablesTable({ payables, onPay, onSelect }: PayablesTableProps) {
  const columns: Column<Payable>[] = [
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
      key: "supplierName",
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
      key: "totalIdr",
      header: "Total PO",
      align: "right",
      render: (row) => formatIdr(row.totalIdr),
    },
    {
      key: "paidAmountIdr",
      header: "Dibayar",
      align: "right",
      render: (row) => (
        <span className="text-coffee-success">{formatIdr(row.paidAmountIdr)}</span>
      ),
    },
    {
      key: "outstandingIdr",
      header: "Sisa Hutang",
      align: "right",
      render: (row) => (
        <span className="font-semibold text-coffee-danger">{formatIdr(row.outstandingIdr)}</span>
      ),
    },
    {
      key: "dueDate",
      header: "Jatuh Tempo",
      render: (row) =>
        row.dueDate
          ? formatDate(row.dueDate)
          : row.expectedDate
            ? formatDate(row.expectedDate)
            : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <ToneBadge tone={purchaseOrderStatusTone(row.status)}>
            {purchaseOrderStatusLabel(row.status)}
          </ToneBadge>
          <ToneBadge tone={purchasePaymentStatusTone(row.paymentStatus)}>
            {purchasePaymentStatusLabel(row.paymentStatus)}
          </ToneBadge>
        </div>
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
            Detail
          </button>
          <button
            type="button"
            className={`${actionButtonClass} border-coffee-brown/40 text-coffee-brown dark:border-coffee-caramel/40 dark:text-coffee-caramel`}
            onClick={(event) => {
              event.stopPropagation();
              onPay(row);
            }}
          >
            Bayar
          </button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={payables}
      keyExtractor={(row) => row.id}
      emptyMessage="Tidak ada hutang supplier"
      onRowClick={onSelect}
    />
  );
}
