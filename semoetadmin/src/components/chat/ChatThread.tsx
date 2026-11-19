"use client";

import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { CheckLineIcon } from "@/icons";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { inputClass, primaryButtonClass } from "@/lib/ui";
import type { AdminChatConversation, ChatMessage } from "@/types/api";
import { useEffect, useRef, useState } from "react";

const STATUS_OPTIONS = [
  { value: "open", label: "Terbuka" },
  { value: "waiting", label: "Menunggu" },
  { value: "resolved", label: "Terselesaikan" },
  { value: "closed", label: "Ditutup" },
];

const CATEGORY_OPTIONS = [
  { value: "general", label: "Chat Biasa" },
  { value: "complaint", label: "Keluhan" },
];

/** Tooltip status pesan keluar: kapan terkirim / dibaca penerima. */
function receiptTitle(message: ChatMessage): string {
  if (message.readAt) return `Dibaca ${formatDateTime(message.readAt)}`;
  if (message.deliveredAt) return `Terkirim ${formatDateTime(message.deliveredAt)}`;
  return "Terkirim";
}

interface ChatThreadProps {
  conversation: AdminChatConversation;
  currentUserId: string | null;
  onUpdated: () => void;
}

/**
 * Panel percakapan: riwayat pesan, balasan staff, ubah status/kategori, dan
 * penugasan. Pesan dimuat ulang otomatis tiap 8 detik agar terasa real-time.
 */
export default function ChatThread({ conversation, currentUserId, onUpdated }: ChatThreadProps) {
  const messages = useApi<ChatMessage[]>(
    `/chat/conversations/${conversation.id}/messages?limit=100`,
  );
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState(() => ({
    status: conversation.status,
    category: conversation.category,
    assignedStaffId: conversation.assignedStaffId,
    assignedStaffName: conversation.assignedStaffName,
  }));
  const bottomRef = useRef<HTMLDivElement>(null);

  const reloadMessages = messages.reload;

  useEffect(() => {
    const timer = window.setInterval(reloadMessages, 8000);
    return () => window.clearInterval(timer);
  }, [reloadMessages]);

  const messageCount = messages.data?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, conversation.id]);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    try {
      await apiPost(`/chat/conversations/${conversation.id}/messages`, { body: text });
      setBody("");
      messages.reload();
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  };

  const updateConversation = async (patch: { status?: string; category?: string }) => {
    setSavingMeta(true);
    setError(null);
    try {
      await apiPatch(`/chat/conversations/${conversation.id}`, patch);
      setMeta((prev) => ({ ...prev, ...patch }));
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui percakapan");
    } finally {
      setSavingMeta(false);
    }
  };

  const assignToMe = async () => {
    setSavingMeta(true);
    setError(null);
    try {
      await apiPost(`/admin/chat/conversations/${conversation.id}/assign`, {
        assignedStaffId: currentUserId,
      });
      setMeta((prev) => ({ ...prev, assignedStaffId: currentUserId, assignedStaffName: "Anda" }));
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menugaskan percakapan");
    } finally {
      setSavingMeta(false);
    }
  };

  const assignedToMe = Boolean(currentUserId && meta.assignedStaffId === currentUserId);

  return (
    <div className="flex min-h-[560px] flex-col rounded-xl border border-coffee-linen dark:border-coffee-night-border">
      <div className="border-b border-coffee-linen px-4 py-3 dark:border-coffee-night-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-coffee-espresso dark:text-coffee-cream">
              {conversation.userName}
            </p>
            <p className="text-theme-xs text-coffee-muted">
              {conversation.userEmail ?? conversation.userPhone ?? conversation.userId}
            </p>
            <p className="mt-1 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
              {conversation.topic}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={meta.category === "complaint" ? "danger" : "coffee"}>
              {meta.category === "complaint" ? "Keluhan" : "Chat Biasa"}
            </ToneBadge>
            <ToneBadge tone={meta.assignedStaffId ? "success" : "warning"}>
              {meta.assignedStaffName ? `Ditangani ${meta.assignedStaffName}` : "Belum ditugaskan"}
            </ToneBadge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[130px] flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
            <select
              value={meta.status}
              disabled={savingMeta}
              onChange={(event) => updateConversation({ status: event.target.value })}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[130px] flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Kategori</span>
            <select
              value={meta.category}
              disabled={savingMeta}
              onChange={(event) => updateConversation({ category: event.target.value })}
              className={inputClass}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={assignToMe}
            disabled={savingMeta || !currentUserId || assignedToMe}
            className="h-10 rounded-lg border border-coffee-linen px-3 text-theme-sm font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk disabled:cursor-not-allowed disabled:opacity-50 dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
          >
            {assignedToMe ? "Ditangani Anda" : "Tugaskan ke Saya"}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-coffee-milk/40 px-4 py-4 dark:bg-coffee-night/40">
        {messages.loading && !messages.data ? (
          <Skeleton className="h-40 w-full" />
        ) : messages.error ? (
          <ErrorBlock message={messages.error} onRetry={messages.reload} />
        ) : messageCount === 0 ? (
          <EmptyBlock message="Belum ada pesan. Mulai percakapan dari kolom di bawah." />
        ) : (
          (messages.data ?? []).map((message) => {
            const isStaff = message.senderType === "staff";
            return (
              <div
                key={message.id}
                className={`flex ${isStaff ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-theme-sm shadow-sm ${
                    isStaff
                      ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                      : "bg-white text-coffee-espresso dark:bg-coffee-night-soft dark:text-coffee-cream"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <div
                    className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] ${
                      isStaff ? "text-coffee-milk/70 dark:text-coffee-night/70" : "text-coffee-muted"
                    }`}
                  >
                    <span>
                      {message.senderName ?? (isStaff ? "Staff" : "Pelanggan")} ·{" "}
                      {formatDateTime(message.createdAt)}
                    </span>
                    {isStaff && (
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          message.readAt
                            ? "font-semibold text-coffee-milk dark:text-coffee-night"
                            : "text-coffee-milk/70 dark:text-coffee-night/70"
                        }`}
                        title={receiptTitle(message)}
                      >
                        <CheckLineIcon className="h-3 w-3" aria-hidden="true" />
                        {message.readAt && (
                          <CheckLineIcon className="-ms-1 h-3 w-3" aria-hidden="true" />
                        )}
                        {message.readAt ? "Dibaca" : "Terkirim"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-coffee-linen p-3 dark:border-coffee-night-border"
      >
        {error && (
          <p className="mb-2 rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-1.5 text-theme-xs text-coffee-danger">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            placeholder="Tulis balasan... (Enter kirim, Shift+Enter baris baru)"
            className={`${inputClass} min-h-[44px] flex-1 resize-y`}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className={`${primaryButtonClass} h-[44px]`}
          >
            {sending ? "Mengirim..." : "Kirim"}
          </button>
        </div>
      </form>
    </div>
  );
}
