"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ExpenseFormModal from "@/components/pengeluaran/ExpenseFormModal";
import ExpensesTable from "@/components/pengeluaran/ExpensesTable";
import { useApi } from "@/hooks/useApi";
import { apiDelete, buildQuery } from "@/lib/client";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/labels";
import { formatIdr } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Expense } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

export default function PengeluaranPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", category: "" });
  const [applied, setApplied] = useState({ q: "", category: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const expenses = useApi<Expense[]>(
    `/admin/expenses${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      category: applied.category,
    })}`,
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/expenses/${deleteTarget.id}`);
    setDeleteTarget(null);
    expenses.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Pengeluaran"
        items={[{ label: "Keuangan" }, { label: "Pengeluaran" }]}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari pengeluaran</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Keterangan atau nominal"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[180px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Kategori</span>
          <select
            value={draft.category}
            onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua Kategori</option>
            {EXPENSE_CATEGORIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ q: "", category: "" });
            setApplied({ q: "", category: "" });
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Pengeluaran Operasional"
        desc="Catatan pengeluaran uang operasional cabang: sewa, utilitas, gaji, bahan baku, alat masak, pemasaran, dan lainnya."
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            + Tambah Pengeluaran
          </button>
        }
      >
        {expenses.loading && !expenses.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : expenses.error ? (
          <ErrorBlock message={expenses.error} onRetry={expenses.reload} />
        ) : (expenses.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada pengeluaran" />
        ) : (
          <div className="space-y-4">
            <ExpensesTable
              expenses={expenses.data!}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
            <Pagination
              page={expenses.meta?.page ?? page}
              totalPages={expenses.meta?.totalPages ?? 1}
              total={expenses.meta?.total}
              unit="pengeluaran"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {createOpen && (
        <ExpenseFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            expenses.reload();
          }}
        />
      )}

      {editTarget && (
        <ExpenseFormModal
          key={editTarget.id}
          expense={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            expenses.reload();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Hapus Pengeluaran"
        message={
          deleteTarget
            ? `Hapus catatan pengeluaran ${expenseCategoryLabel(deleteTarget.category)} sebesar ${formatIdr(deleteTarget.amountIdr)}?`
            : ""
        }
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
