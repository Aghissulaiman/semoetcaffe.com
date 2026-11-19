"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import PayablesTable from "@/components/pembelian/PayablesTable";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { formatIdr, formatNumber } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Payable, Supplier } from "@/types/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const LIMIT = 20;

interface Filters {
  q: string;
  supplierId: string;
}

const EMPTY_FILTERS: Filters = { q: "", supplierId: "" };

/** Daftar hutang usaha (accounts payable) ke supplier. */
export default function HutangPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const suppliers = useApi<Supplier[]>("/admin/suppliers?limit=100");
  const payables = useApi<Payable[]>(
    `/admin/payables${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      supplierId: applied.supplierId,
    })}`,
  );

  const totalOutstanding = Number(payables.meta?.totalOutstandingIdr ?? 0);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Hutang Supplier"
        items={[{ label: "Pembelian", href: "/pembelian" }, { label: "Hutang" }]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
          <p className="text-theme-xs font-medium uppercase tracking-wider text-coffee-muted">
            Total Sisa Hutang
          </p>
          <p className="mt-1 text-2xl font-semibold text-coffee-danger">
            {formatIdr(totalOutstanding)}
          </p>
          <p className="mt-1 text-theme-xs text-coffee-muted">
            Akumulasi seluruh PO yang belum lunas.
          </p>
        </div>
        <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
          <p className="text-theme-xs font-medium uppercase tracking-wider text-coffee-muted">
            PO Belum Lunas
          </p>
          <p className="mt-1 text-2xl font-semibold text-coffee-espresso dark:text-coffee-cream">
            {formatNumber(payables.meta?.total ?? 0)}
          </p>
          <p className="mt-1 text-theme-xs text-coffee-muted">
            Termasuk pembayaran sebagian (DP).
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari hutang</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nomor PO atau supplier"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[200px] flex-col gap-1">
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
        title="Daftar Hutang"
        desc="Urut berdasarkan perkiraan tanggal datang. Klik baris untuk membuka detail PO."
      >
        {payables.loading && !payables.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : payables.error ? (
          <ErrorBlock message={payables.error} onRetry={payables.reload} />
        ) : (payables.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada hutang supplier" />
        ) : (
          <div className="space-y-4">
            <PayablesTable
              payables={payables.data!}
              onPay={(payable) => router.push(`/pembelian/${payable.id}/bayar`)}
              onSelect={(payable) => router.push(`/pembelian/${payable.id}`)}
            />
            <Pagination
              page={payables.meta?.page ?? page}
              totalPages={payables.meta?.totalPages ?? 1}
              total={payables.meta?.total}
              unit="PO"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
