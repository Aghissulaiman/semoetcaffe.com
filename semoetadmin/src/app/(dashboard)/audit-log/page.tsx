"use client";

import AuditLogTable from "@/components/audit/AuditLogTable";
import AppModal from "@/components/common/AppModal";
import ComponentCard from "@/components/common/ComponentCard";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { auditActionLabel, entityTypeLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { AuditLog, AuditLogFilters } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

const EMPTY_FILTERS = {
  q: "",
  actorUserId: "",
  action: "",
  entityType: "",
  from: "",
  to: "",
};

const EXPORT_COLUMNS: CsvColumn<AuditLog>[] = [
  { header: "Waktu", value: (row) => formatDateTime(row.createdAt) },
  { header: "Aktor", value: (row) => row.actorName ?? "Sistem" },
  { header: "Aksi", value: (row) => row.action },
  { header: "Entitas", value: (row) => row.entityType },
  { header: "ID Entitas", value: (row) => row.entityId ?? "" },
  { header: "Request ID", value: (row) => row.requestId ?? "" },
  { header: "IP", value: (row) => row.ipAddress ?? "" },
];

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const filters = useApi<AuditLogFilters>("/admin/audit-logs/filters");
  const logs = useApi<AuditLog[]>(
    `/admin/audit-logs${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      actorUserId: applied.actorUserId,
      action: applied.action,
      entityType: applied.entityType,
      from: applied.from,
      to: applied.to,
    })}`,
  );

  const meta = logs.meta;

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Aktivitas & Audit"
        items={[{ label: "Aktivitas & Audit" }]}
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
          <span className="text-theme-xs font-medium text-coffee-muted">Cari aktivitas</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Aktor, aksi, entitas, atau ID..."
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[180px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Admin / Pengguna</span>
          <select
            value={draft.actorUserId}
            onChange={(event) => setDraft((prev) => ({ ...prev, actorUserId: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua aktor</option>
            {(filters.data?.actors ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[190px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Aksi</span>
          <select
            value={draft.action}
            onChange={(event) => setDraft((prev) => ({ ...prev, action: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua aksi</option>
            {(filters.data?.actions ?? []).map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[170px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Entitas</span>
          <select
            value={draft.entityType}
            onChange={(event) => setDraft((prev) => ({ ...prev, entityType: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua entitas</option>
            {(filters.data?.entityTypes ?? []).map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityTypeLabel(entityType)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Rentang tanggal</span>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Total Aktivitas" value={String(meta?.total ?? 0)} />
        <Tile label="Admin Terlibat" value={String(filters.data?.actors.length ?? 0)} />
        <Tile label="Jenis Aktivitas" value={String(filters.data?.actions.length ?? 0)} />
      </div>

      <ComponentCard
        title="Jejak Aktivitas Sistem"
        desc="Semua penambahan, perubahan, penghapusan, transfer stok, dan tindakan admin tercatat di sini."
        action={
          <ExportCsvButton
            filename="aktivitas-sistem.csv"
            rows={logs.data ?? []}
            columns={EXPORT_COLUMNS}
            title="Aktivitas Sistem"
          />
        }
      >
        {logs.loading && !logs.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : logs.error ? (
          <ErrorBlock message={logs.error} onRetry={logs.reload} />
        ) : (logs.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada aktivitas yang cocok" />
        ) : (
          <div className="space-y-4">
            <AuditLogTable logs={logs.data!} onSelect={setSelected} />
            <Pagination
              page={meta?.page ?? page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              unit="aktivitas"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      <AppModal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Detail Aktivitas"
        desc={selected ? formatDateTime(selected.createdAt) : undefined}
        size="lg"
      >
        {selected && (
          <dl className="space-y-3 text-theme-sm">
            <DetailRow label="Aksi" value={auditActionLabel(selected.action)} />
            <DetailRow label="Kode aksi" value={selected.action} mono />
            <DetailRow label="Entitas" value={entityTypeLabel(selected.entityType)} />
            <DetailRow label="ID Entitas" value={selected.entityId ?? "-"} mono />
            <DetailRow label="Aktor" value={selected.actorName ?? "Sistem"} />
            <DetailRow label="Request ID" value={selected.requestId ?? "-"} mono />
            <DetailRow label="IP" value={selected.ipAddress ?? "-"} mono />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <JsonBlock title="Data Sebelum" value={selected.oldData} />
              <JsonBlock title="Data Sesudah" value={selected.newData} />
            </div>
          </dl>
        )}
      </AppModal>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <p className="text-theme-sm text-coffee-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-coffee-espresso dark:text-coffee-cream">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-coffee-linen pb-2.5 last:border-0 dark:border-coffee-night-border">
      <dt className="text-coffee-muted">{label}</dt>
      <dd
        className={`text-end font-medium text-coffee-espresso dark:text-coffee-cream ${mono ? "font-mono text-theme-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
        <p className="mb-1 text-theme-xs font-semibold text-coffee-muted">{title}</p>
        <p className="text-theme-sm text-coffee-muted">—</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
      <p className="mb-1 text-theme-xs font-semibold text-coffee-muted">{title}</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-theme-xs text-coffee-dark dark:text-coffee-cream/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
