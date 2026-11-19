"use client";

import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import AppModal from "@/components/common/AppModal";
import ComponentCard from "@/components/common/ComponentCard";
import DataTable, { type Column } from "@/components/common/DataTable";
import { EmptyBlock, ErrorBlock } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ToneBadge from "@/components/common/ToneBadge";
import type { CsvColumn } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass, textareaClass } from "@/lib/ui";
import type { StatusTone } from "@/lib/labels";
import type { AdminMoment, AdminMomentMedia } from "@/types/api";
import { CheckCircleIcon, EyeIcon, ListIcon, PageIcon, VideoIcon, XCircleIcon } from "@/icons";

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "pending", label: "Menunggu Moderasi" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
];

const MODERATION_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Moderasi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const MODERATION_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  community: "Komunitas",
  birthday: "Ulang Tahun",
  wedding: "Pernikahan",
  event: "Event",
  other: "Lainnya",
};

const MOMENT_COLUMNS: CsvColumn<AdminMoment>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Media", value: (r) => (r.media?.length ? `${r.media.length} file` : "") },
  { header: "Judul", value: (r) => r.title ?? "" },
  { header: "Caption", value: (r) => r.caption ?? "" },
  { header: "Tipe", value: (r) => EVENT_TYPE_LABEL[r.eventType ?? ""] ?? r.eventType ?? "" },
  { header: "Status", value: (r) => MODERATION_STATUS_LABEL[r.moderationStatus] ?? r.moderationStatus },
  { header: "Penulis", value: (r) => r.authorName },
  { header: "Email", value: (r) => r.authorEmail ?? "" },
  { header: "Dibuat", value: (r) => (r.createdAt ? formatDateTime(r.createdAt) : "") },
];

/** Dialog moderasi (setujui/tolak) dengan catatan opsional. */
function ModerateMomentDialog({
  moment,
  action,
  onClose,
  onDone,
}: {
  moment: AdminMoment;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isApprove = action === "approve";

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // TODO: hubungkan ke endpoint moderasi moment saat tersedia.
      await new Promise((resolve) => setTimeout(resolve, 500));
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isApprove ? "Setujui Moment" : "Tolak Moment"}
      size="md"
    >
      <p className="text-theme-sm text-coffee-muted">
        Yakin ingin {isApprove ? "menyetujui" : "menolak"} moment &quot;
        {moment.title ?? `${moment.id.slice(0, 8)}…`}&quot;?
      </p>
      <div className="mt-4">
        <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">
          Catatan moderasi (opsional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={
            isApprove
              ? "Contoh: Konten sesuai pedoman komunitas, disetujui untuk dipublikasikan."
              : "Contoh: Konten melanggar pedoman komunitas (spam/kasar/tidak relevan)."
          }
          className={`w-full ${textareaClass}`}
        />
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} disabled={submitting} className={secondaryButtonClass}>
          Batal
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={isApprove ? primaryButtonClass : dangerButtonClass}
        >
          {submitting ? "Memproses…" : isApprove ? "Setujui" : "Tolak"}
        </button>
      </div>
    </AppModal>
  );
}

export default function MomentPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState<AdminMoment | null>(null);
  const [moderateOpen, setModerateOpen] = useState<{
    moment: AdminMoment;
    action: "approve" | "reject";
  } | null>(null);

  const moments = useApi<AdminMoment[]>(
    `/admin/moments?page=${page}&limit=20${status ? `&moderationStatus=${status}` : ""}${
      search ? `&q=${encodeURIComponent(search)}` : ""
    }`,
  );

  const loading = moments.loading && !moments.data;
  const items = moments.data ?? [];

  const columns: Column<AdminMoment>[] = [
    {
      key: "id",
      header: "ID",
      width: "80px",
      render: (row) => <span className="font-mono text-theme-xs">{row.id.slice(0, 8)}…</span>,
    },
    {
      key: "media",
      header: "Media",
      width: "120px",
      render: (row) => {
        if (!row.media?.length) return <span className="text-coffee-muted">—</span>;
        return (
          <div className="flex gap-1">
            {row.media.slice(0, 3).map((m, i) => (
              <div
                key={i}
                className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-coffee-linen dark:bg-coffee-night-border"
              >
                {m.mediaType === "video" ? (
                  <VideoIcon className="h-5 w-5 text-coffee-muted" />
                ) : m.publicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.publicUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PageIcon className="h-5 w-5 text-coffee-muted" />
                )}
                {row.media.length > 3 && i === 2 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
                    +{row.media.length - 3}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "title",
      header: "Judul / Caption",
      render: (row) => (
        <div className="flex max-w-xs flex-col gap-1">
          {row.title && <span className="line-clamp-1 font-medium">{row.title}</span>}
          {row.caption && (
            <span className="line-clamp-2 text-theme-sm text-coffee-muted">{row.caption}</span>
          )}
          {!row.title && !row.caption && (
            <span className="italic text-coffee-muted">(tanpa teks)</span>
          )}
        </div>
      ),
    },
    {
      key: "eventType",
      header: "Tipe",
      width: "120px",
      render: (row) => (
        <ToneBadge tone="coffee">
          {EVENT_TYPE_LABEL[row.eventType ?? ""] ?? row.eventType ?? "—"}
        </ToneBadge>
      ),
    },
    {
      key: "moderationStatus",
      header: "Status",
      width: "160px",
      render: (row) => (
        <ToneBadge tone={MODERATION_STATUS_TONE[row.moderationStatus] ?? "muted"}>
          {MODERATION_STATUS_LABEL[row.moderationStatus] ?? row.moderationStatus}
        </ToneBadge>
      ),
    },
    { key: "authorName", header: "Penulis" },
    {
      key: "createdAt",
      header: "Dibuat",
      width: "160px",
      render: (row) => (row.createdAt ? formatDateTime(row.createdAt) : "—"),
    },
    {
      key: "actions",
      header: "Aksi",
      width: "160px",
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDetailOpen(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-linen bg-white px-3 py-1.5 text-theme-sm font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:hover:bg-white/5"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          {row.moderationStatus === "pending" && (
            <>
              <button
                onClick={() => setModerateOpen({ moment: row, action: "approve" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-success bg-coffee-success/5 px-3 py-1.5 text-theme-sm font-medium text-coffee-success transition-colors hover:bg-coffee-success/10 dark:border-coffee-success dark:bg-coffee-success/10 dark:hover:bg-coffee-success/20"
              >
                <CheckCircleIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setModerateOpen({ moment: row, action: "reject" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-danger bg-coffee-danger/5 px-3 py-1.5 text-theme-sm font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10 dark:border-coffee-danger dark:bg-coffee-danger/10 dark:hover:bg-coffee-danger/20"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (detailOpen) {
    return (
      <AppModal
        isOpen
        onClose={() => setDetailOpen(null)}
        title={`Detail Moment: ${detailOpen.id.slice(0, 8)}…`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-theme-sm text-coffee-muted">ID Moment</p>
              <p className="font-mono font-semibold">{detailOpen.id}</p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Status Moderasi</p>
              <ToneBadge tone={MODERATION_STATUS_TONE[detailOpen.moderationStatus] ?? "muted"}>
                {MODERATION_STATUS_LABEL[detailOpen.moderationStatus] ?? detailOpen.moderationStatus}
              </ToneBadge>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Tipe Event</p>
              <p>{EVENT_TYPE_LABEL[detailOpen.eventType ?? ""] ?? detailOpen.eventType ?? "—"}</p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Dibuat</p>
              <p>{detailOpen.createdAt ? formatDateTime(detailOpen.createdAt) : "—"}</p>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-theme-sm text-coffee-muted">Judul</p>
            <p className="font-medium">
              {detailOpen.title ?? <span className="italic text-coffee-muted">(tanpa judul)</span>}
            </p>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-theme-sm text-coffee-muted">Caption</p>
            <p className="whitespace-pre-wrap text-coffee-muted">
              {detailOpen.caption ?? <span className="italic">(tanpa caption)</span>}
            </p>
          </div>

          {detailOpen.media?.length > 0 && (
            <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
              <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">Media</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {detailOpen.media.map((m: AdminMomentMedia, i: number) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-lg bg-coffee-linen dark:bg-coffee-night-border"
                  >
                    {m.mediaType === "video" ? (
                      <div className="flex h-full w-full items-center justify-center bg-coffee-night-soft">
                        <VideoIcon className="h-12 w-12 text-coffee-muted" />
                        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                          Video
                        </div>
                      </div>
                    ) : m.publicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.publicUrl}
                        alt={detailOpen.title ?? "Moment media"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PageIcon className="h-12 w-12 text-coffee-muted" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
            <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">Penulis</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-theme-sm text-coffee-muted">Nama</p>
                <p>{detailOpen.authorName}</p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Email</p>
                <p>{detailOpen.authorEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">User ID</p>
                <p className="font-mono text-theme-xs">{detailOpen.userId ?? "—"}</p>
              </div>
            </div>
          </div>

          {detailOpen.moderationStatus === "pending" && (
            <div className="flex justify-end gap-3 border-t border-coffee-linen pt-4 dark:border-coffee-night-border">
              <button
                onClick={() => setModerateOpen({ moment: detailOpen, action: "reject" })}
                className="inline-flex items-center gap-2 rounded-lg border border-coffee-danger bg-coffee-danger/5 px-4 py-2 text-theme-sm font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10 dark:border-coffee-danger dark:bg-coffee-danger/10 dark:hover:bg-coffee-danger/20"
              >
                <XCircleIcon className="h-4 w-4" />
                Tolak
              </button>
              <button
                onClick={() => setModerateOpen({ moment: detailOpen, action: "approve" })}
                className="inline-flex items-center gap-2 rounded-lg border border-coffee-success bg-coffee-success px-4 py-2 text-theme-sm font-medium text-coffee-cream transition-colors hover:bg-coffee-success/90 dark:border-coffee-success dark:bg-coffee-success dark:text-coffee-night dark:hover:bg-coffee-success/90"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Setujui
              </button>
            </div>
          )}
        </div>
      </AppModal>
    );
  }

  if (moderateOpen) {
    return (
      <ModerateMomentDialog
        moment={moderateOpen.moment}
        action={moderateOpen.action}
        onClose={() => setModerateOpen(null)}
        onDone={() => {
          moments.reload();
          setModerateOpen(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageBreadCrumb
        pageTitle="Moderasi Moment"
        items={[{ label: "Dashboard", href: "/" }, { label: "Moderasi Moment" }]}
      />

      <ComponentCard
        title="Moderasi Moment"
        desc="Kelola konten user-generated yang perlu direview sebelum dipublikasikan"
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">
              Status Moderasi
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-coffee-linen bg-white px-3 py-2 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:outline-none focus:ring-2 focus:ring-coffee-brown/20 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">Cari</label>
            <div className="relative">
              <ListIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coffee-muted" />
              <input
                type="text"
                placeholder="Judul, caption, penulis..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-coffee-linen bg-white py-2 pl-10 pr-3 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:outline-none focus:ring-2 focus:ring-coffee-brown/20 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
              />
            </div>
          </div>
          <ExportCsvButton filename="moment-moderation.csv" rows={items} columns={MOMENT_COLUMNS} />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-coffee-linen/50 dark:bg-coffee-night-border/50"
              />
            ))}
          </div>
        ) : moments.error ? (
          <ErrorBlock message={moments.error} onRetry={moments.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock message="Tidak ada moment pada periode ini" />
        ) : (
          <>
            <DataTable columns={columns} data={items} />
            {moments.meta && moments.meta.totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination page={page} totalPages={moments.meta.totalPages} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </ComponentCard>
    </div>
  );
}
