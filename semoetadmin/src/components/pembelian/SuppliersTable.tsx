"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import type { Supplier } from "@/types/api";

interface SuppliersTableProps {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
  onDelete: (supplier: Supplier) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5";

export default function SuppliersTable({ suppliers, onEdit, onDelete }: SuppliersTableProps) {
  const columns: Column<Supplier>[] = [
    { key: "code", header: "Kode" },
    {
      key: "name",
      header: "Supplier",
      render: (row) => (
        <div>
          <p className="font-semibold text-coffee-dark dark:text-coffee-cream">{row.name}</p>
          {row.contactName && (
            <p className="text-theme-xs text-coffee-muted">{row.contactName}</p>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Kontak",
      render: (row) => (
        <div className="text-theme-xs text-coffee-muted">
          {row.phone && <p>{row.phone}</p>}
          {row.email && <p>{row.email}</p>}
          {!row.phone && !row.email && <p>—</p>}
        </div>
      ),
    },
    {
      key: "purchaseOrderCount",
      header: "Purchase Order",
      align: "right",
      render: (row) => `${row.purchaseOrderCount} PO`,
    },
    {
      key: "isActive",
      header: "Status",
      render: (row) => (
        <ToneBadge tone={row.isActive ? "success" : "muted"}>
          {row.isActive ? "Aktif" : "Nonaktif"}
        </ToneBadge>
      ),
    },
    {
      key: "actions",
      header: "Aksi",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onEdit(row)} className={actionButtonClass}>
            Ubah
          </button>
          <button
            type="button"
            onClick={() => onDelete(row)}
            className={`${actionButtonClass} text-coffee-danger`}
          >
            Hapus
          </button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={suppliers}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada supplier"
    />
  );
}
