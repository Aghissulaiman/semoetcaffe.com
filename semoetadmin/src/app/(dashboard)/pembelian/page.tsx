"use client";

import ComponentCard from "@/components/common/ComponentCard";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import PurchaseOrderFormModal from "@/components/pembelian/PurchaseOrderFormModal";
import PurchaseOrdersTable from "@/components/pembelian/PurchaseOrdersTable";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import {
  purchaseOrderStatusLabel,
  purchasePaymentStatusLabel,
} from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { PurchaseOrder, Supplier } from "@/types/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LIMIT = 20;

const ORDER_STATUSES = ["draft", "ordered", "partial", "received", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "partial", "paid"];

interface Filters {
  q: string;
  status: string;
  paymentStatus: string;
  supplierId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  q: "",
  status: "",
  paymentStatus: "",
  supplierId: "",
  from: "",
  to: "",
};

export default function PembelianPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);

  const suppliers = useApi<Supplier[]>("/admin/suppliers?limit=100&isActive=true");
  const orders = useApi<PurchaseOrder[]>(
    `/admin/purchase-orders${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      status: applied.status,
      paymentStatus: applied.paymentStatus,
      supplierId: applied.supplierId,
      from: applied.from,
      to: applied.to,
    })}`,
  );

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Pembelian" items={[{ label: "Pembelian" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari PO</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nomor PO, supplier, atau kode"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status Dokumen</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {purchaseOrderStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Pembayaran</span>
          <select
            value={draft.paymentStatus}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, paymentStatus: event.target.value }))
            }
            className={inputClass}
          >
            <option value="">Semua</option>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {purchasePaymentStatusLabel(status)}
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
          <span className="text-theme-xs font-medium text-coffee-muted">Tanggal PO</span>
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
        title="Purchase Order"
        desc="Dokumen pemesanan barang ke supplier. Klik baris untuk melihat detail dan penerimaan."
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            + Buat PO
          </button>
        }
      >
        {orders.loading && !orders.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : orders.error ? (
          <ErrorBlock message={orders.error} onRetry={orders.reload} />
        ) : (orders.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada purchase order" />
        ) : (
          <div className="space-y-4">
            <PurchaseOrdersTable
              orders={orders.data!}
              onSelect={(order) => router.push(`/pembelian/${order.id}`)}
            />
            <Pagination
              page={orders.meta?.page ?? page}
              totalPages={orders.meta?.totalPages ?? 1}
              total={orders.meta?.total}
              unit="PO"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {createOpen && (
        <PurchaseOrderFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            orders.reload();
          }}
        />
      )}
    </div>
  );
}
