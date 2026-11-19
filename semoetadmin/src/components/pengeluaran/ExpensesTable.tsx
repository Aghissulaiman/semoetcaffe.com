"use client";

import DataTable, { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { expenseCategoryLabel, expenseCategoryTone } from "@/lib/labels";
import { formatDate, formatIdr } from "@/lib/format";
import type { Expense } from "@/types/api";

interface ExpensesTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5";

export default function ExpensesTable({ expenses, onEdit, onDelete }: ExpensesTableProps) {
  const columns: Column<Expense>[] = [
    {
      key: "expenseDate",
      header: "Tanggal",
      render: (row) => formatDate(row.expenseDate),
    },
    {
      key: "name",
      header: "Nama Pengeluaran",
      render: (row) => (
        <span className="font-semibold text-coffee-dark dark:text-coffee-cream">
          {row.name}
        </span>
      ),
    },
    {
      key: "category",
      header: "Kategori",
      render: (row) => (
        <ToneBadge tone={expenseCategoryTone(row.category)}>
          {expenseCategoryLabel(row.category)}
        </ToneBadge>
      ),
    },
    {
      key: "note",
      header: "Keterangan",
      render: (row) => (
        <span className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
          {row.note?.trim() ? row.note : "—"}
        </span>
      ),
    },
    {
      key: "amountIdr",
      header: "Nominal",
      align: "right",
      render: (row) => <span className="font-semibold">{formatIdr(row.amountIdr)}</span>,
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
      data={expenses}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada pengeluaran"
    />
  );
}
