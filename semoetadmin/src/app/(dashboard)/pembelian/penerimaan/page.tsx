"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import GoodsReceiptDetailModal from "@/components/pembelian/GoodsReceiptDetailModal";
import GoodsReceiptsTable from "@/components/pembelian/GoodsReceiptsTable";
import { useApi } from "@/hooks/useApi";
import { apiPost, buildQuery } from "@/lib/client";
import { goodsReceiptStatusLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { GoodsReceipt, Supplier } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;
const STATUSES = ["draft", "posted"];

interface Filters {
  q: string;
  status: string;
  supplierId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: "", status: "", supplierId: "", from: "", to: "" };

/** Daftar dokumen penerimaan barang (stok masuk) dari purchase order. */
export default function PenerimaanPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [postTarget, setPostTarget] = useState<GoodsReceipt | null>(null);

  const suppliers = useApi<Supplier[]>("/admin/suppliers?limit=100");
  const receipts = useApi<GoodsReceipt[]>(
    `/admin/goods-receipts${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      status: applied.status,
      supplierId: applied.supplierId,
      from: applied.from,
      to: applied.to,
    })}`,
  );

  const handlePost = async () => {
    if (!postTarget) return;
    await apiPost(`/admin/goods-receipts/${postTarget.id}/post`, {});
    setPostTarget(null);
    receipts.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Penerimaan Barang"
        items={[{ label: "Pembelian", href: "/pembelian" }, { label: "Penerimaan" }]}
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
          <span className="text-theme-xs font-medium text-coffee-muted">Cari penerimaan</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nomor penerimaan, PO, atau supplier"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[150px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {goodsReceiptStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Supplier</span>
          <select
            value={draft.supplierId}
            onChange={(event) => setDraft((prev) => ({ ...prev, supplierId: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua Supplier</option>
            {(suppliers.data ?? []).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Tanggal Terima</span>
          <DateRangePicker
            from={draft.from}
            to={draft.to}
            onChange={(from, to) => setDraft((prev) => ({ ...prev, from, to }))}
            allowAll
          />
        </div>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY_FILTERS);
            setApplied(EMPTY_FILTERS);
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Stok Masuk"
        desc="Dokumen penerimaan barang. Status Posted berarti stok sudah bertambah dan tercatat di log inventori."
      >
        {receipts.loading && !receipts.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : receipts.error ? (
          <ErrorBlock message={receipts.error} onRetry={receipts.reload} />
        ) : (receipts.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada dokumen penerimaan" />
        ) : (
          <div className="space-y-4">
            <GoodsReceiptsTable
              receipts={receipts.data!}
              onSelect={(receipt) => setDetailId(receipt.id)}
              onPost={setPostTarget}
            />
            <Pagination
              page={receipts.meta?.page ?? page}
              totalPages={receipts.meta?.totalPages ?? 1}
              total={receipts.meta?.total}
              unit="penerimaan"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {detailId && (
        <GoodsReceiptDetailModal
          receiptId={detailId}
          onClose={() => setDetailId(null)}
          onPost={
            receipts.data?.find((receipt) => receipt.id === detailId)?.status === "draft"
              ? () => {
                  const target = receipts.data?.find((receipt) => receipt.id === detailId);
                  if (target) setPostTarget(target);
                  setDetailId(null);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(postTarget)}
        title="Posting Penerimaan"
        message={`Posting ${postTarget?.number ?? ""}? Stok bahan akan bertambah dan log inventori mencatat referensi PO.`}
        confirmLabel="Posting"
        tone="neutral"
        onConfirm={handlePost}
        onClose={() => setPostTarget(null)}
      />
    </div>
  );
}
