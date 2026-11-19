"use client";

import ChatThread from "@/components/chat/ChatThread";
import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/hooks/useSession";
import { buildQuery } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import { formatDateTime, formatRelative } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { AdminChatConversation } from "@/types/api";
import { cn } from "@/utils";
import { useEffect, useState } from "react";

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "open", label: "Terbuka" },
  { value: "waiting", label: "Menunggu" },
  { value: "resolved", label: "Terselesaikan" },
  { value: "closed", label: "Ditutup" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Semua Kategori" },
  { value: "complaint", label: "Keluhan" },
  { value: "general", label: "Chat Biasa" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  waiting: "Menunggu",
  resolved: "Terselesaikan",
  closed: "Ditutup",
};

function statusTone(status: string): "success" | "warning" | "danger" | "muted" | "coffee" {
  if (status === "open") return "success";
  if (status === "waiting") return "warning";
  if (status === "closed") return "danger";
  if (status === "resolved") return "muted";
  return "coffee";
}

const EXPORT_COLUMNS: CsvColumn<AdminChatConversation>[] = [
  { header: "Pelanggan", value: (row) => row.userName },
  { header: "Email", value: (row) => row.userEmail ?? "" },
  { header: "Telepon", value: (row) => row.userPhone ?? "" },
  { header: "Topik", value: (row) => row.topic },
  { header: "Kategori", value: (row) => (row.category === "complaint" ? "Keluhan" : "Chat Biasa") },
  { header: "Status", value: (row) => STATUS_LABEL[row.status] ?? row.status },
  { header: "Ditangani", value: (row) => row.assignedStaffName ?? "Belum ditugaskan" },
  { header: "Jumlah Pesan", value: (row) => row.messageCount },
  { header: "Pesan Terakhir", value: (row) => row.lastMessagePreview ?? "" },
  {
    header: "Waktu Pesan",
    value: (row) => (row.lastMessageAt ? formatDateTime(row.lastMessageAt) : ""),
  },
];

export default function ChatPage() {
  const { me } = useSession();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", status: "", category: "" });
  const [applied, setApplied] = useState({ q: "", status: "", category: "" });
  const [selected, setSelected] = useState<AdminChatConversation | null>(null);

  const conversations = useApi<AdminChatConversation[]>(
    `/admin/chat/conversations${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      status: applied.status,
      category: applied.category,
    })}`,
  );

  // Sumber ringkasan antrean (endpoint staff mengirim meta.queue).
  const queueInfo = useApi<unknown>("/chat/conversations?limit=1");
  const queue = (queueInfo.meta?.queue ?? {}) as {
    open?: number;
    waiting?: number;
    unassigned?: number;
  };

  const reloadConversations = conversations.reload;
  const reloadQueue = queueInfo.reload;

  const reloadAll = () => {
    reloadConversations();
    reloadQueue();
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      reloadConversations();
      reloadQueue();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [reloadConversations, reloadQueue]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Chat & Keluhan" items={[{ label: "Chat" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari percakapan</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama pelanggan, email, atau topik"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[170px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Kategori</span>
          <select
            value={draft.category}
            onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
            className={inputClass}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
            setDraft({ q: "", status: "", category: "" });
            setApplied({ q: "", status: "", category: "" });
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Percakapan Terbuka" value={queue.open ?? 0} />
        <Tile label="Menunggu Balasan" value={queue.waiting ?? 0} />
        <Tile label="Belum Ditugaskan" value={queue.unassigned ?? 0} danger={(queue.unassigned ?? 0) > 0} />
      </div>

      <ComponentCard
        title="Percakapan Pelanggan"
        desc="Pilih percakapan di kiri untuk membaca dan membalas. Data diperbarui otomatis."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportCsvButton
              filename="percakapan-chat.csv"
              rows={conversations.data ?? []}
              columns={EXPORT_COLUMNS}
              title="Percakapan Pelanggan"
            />
            <button type="button" onClick={reloadAll} className={secondaryButtonClass}>
              Muat Ulang
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <div className="min-w-0 space-y-3">
            {conversations.loading && !conversations.data ? (
              <Skeleton className="h-[560px] w-full" />
            ) : conversations.error ? (
              <ErrorBlock message={conversations.error} onRetry={conversations.reload} />
            ) : (conversations.data?.length ?? 0) === 0 ? (
              <EmptyBlock message="Tidak ada percakapan yang cocok" />
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-y-auto pe-1">
                {(conversations.data ?? []).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelected(conversation)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-start transition-colors",
                      selected?.id === conversation.id
                        ? "border-coffee-brown bg-coffee-milk/70 dark:border-coffee-caramel dark:bg-white/5"
                        : "border-coffee-linen hover:bg-coffee-milk/50 dark:border-coffee-night-border dark:hover:bg-white/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-coffee-espresso dark:text-coffee-cream">
                          {conversation.userName}
                        </p>
                        <p className="truncate text-theme-xs text-coffee-muted">
                          {conversation.topic}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-coffee-muted">
                        {formatRelative(conversation.lastMessageAt ?? conversation.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ToneBadge tone={statusTone(conversation.status)}>
                        {STATUS_LABEL[conversation.status] ?? conversation.status}
                      </ToneBadge>
                      <ToneBadge tone={conversation.category === "complaint" ? "danger" : "coffee"}>
                        {conversation.category === "complaint" ? "Keluhan" : "Chat Biasa"}
                      </ToneBadge>
                      {!conversation.assignedStaffId && <ToneBadge tone="warning">Belum ditangani</ToneBadge>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-theme-xs text-coffee-dark dark:text-coffee-cream/70">
                      {conversation.lastMessagePreview ?? "Belum ada pesan"}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <Pagination
              page={conversations.meta?.page ?? page}
              totalPages={conversations.meta?.totalPages ?? 1}
              total={conversations.meta?.total}
              unit="percakapan"
              onPageChange={setPage}
            />
          </div>

          <div className="min-w-0">
            {selected ? (
              <ChatThread
                key={selected.id}
                conversation={selected}
                currentUserId={me?.user.id ?? null}
                onUpdated={reloadAll}
              />
            ) : (
              <div className="flex h-full min-h-[560px] items-center justify-center rounded-xl border border-dashed border-coffee-linen p-8 text-center dark:border-coffee-night-border">
                <div>
                  <p className="font-semibold text-coffee-espresso dark:text-coffee-cream">
                    Pilih percakapan
                  </p>
                  <p className="mt-1 text-theme-sm text-coffee-muted">
                    Riwayat pesan, balasan, status, dan penugasan muncul di sini.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}

function Tile({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <p className="text-theme-sm text-coffee-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-bold",
          danger ? "text-coffee-danger" : "text-coffee-espresso dark:text-coffee-cream",
        )}
      >
        {value}
      </p>
    </div>
  );
}
