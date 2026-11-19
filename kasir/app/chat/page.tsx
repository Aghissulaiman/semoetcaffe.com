"use client";

import {
  ArrowLeft,
  CheckCheck,
  Inbox,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Select,
  TextArea,
} from "@/components/ui";
import {
  api,
  apiErrorFrom,
  request,
  type ApiChatConversation,
  type ApiChatMessage,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { useKasir } from "@/lib/store";

const LIST_POLL_MS = 10_000;
const MESSAGE_POLL_MS = 5_000;

const STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  waiting: "Menunggu",
  resolved: "Terselesaikan",
  closed: "Ditutup",
};

const STATUS_TONE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "brown"
> = {
  open: "success",
  waiting: "warning",
  resolved: "default",
  closed: "danger",
};

const STATUS_FILTERS = [
  { value: "", label: "Semua status" },
  { value: "waiting", label: "Menunggu balasan" },
  { value: "open", label: "Terbuka" },
  { value: "resolved", label: "Terselesaikan" },
  { value: "closed", label: "Ditutup" },
];

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

function initials(name: string | null | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function customerName(name: string | null | undefined): string {
  return name?.trim() || "Pelanggan";
}

function senderLabel(message: ApiChatMessage): string {
  if (message.senderName) return message.senderName;
  if (message.senderType === "staff") return "Staff";
  if (message.senderType === "assistant") return "Asisten";
  if (message.senderType === "system") return "Sistem";
  return "Pelanggan";
}

export default function ChatPage() {
  const { hydrated, user } = useKasir();

  const [conversations, setConversations] = useState<ApiChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<ApiChatConversation | null>(null);

  const [messages, setMessages] = useState<ApiChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const listSeqRef = useRef(0);
  const messageSeqRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedId = selected?.id ?? null;

  // Pencarian diketik dengan debounce supaya daftar tidak bolak-balik request.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadConversations = useCallback(
    async (silent = false) => {
      const seq = ++listSeqRef.current;
      try {
        const result = await request<ApiChatConversation[]>(
          "/admin/chat/conversations",
          {
            query: {
              limit: 50,
              q: appliedSearch || undefined,
              status: statusFilter || undefined,
            },
          },
        );
        if (seq !== listSeqRef.current) return;

        const rows = result.data ?? [];
        setConversations(rows);
        setListError(null);
        setSelected((current) =>
          current ? rows.find((row) => row.id === current.id) ?? current : current,
        );
      } catch (err) {
        if (seq !== listSeqRef.current) return;
        if (!silent) {
          setListError(apiErrorFrom(err, "Gagal memuat daftar chat"));
        }
      } finally {
        if (seq === listSeqRef.current && !silent) setListLoading(false);
      }
    },
    [appliedSearch, statusFilter],
  );

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!selectedId) return;
      const seq = ++messageSeqRef.current;
      try {
        const rows = await api<ApiChatMessage[]>(
          `/chat/conversations/${selectedId}/messages`,
          { query: { limit: 100 } },
        );
        if (seq !== messageSeqRef.current) return;
        setMessages(rows);
        setMessagesError(null);
      } catch (err) {
        if (seq !== messageSeqRef.current) return;
        if (!silent) {
          setMessagesError(apiErrorFrom(err, "Gagal memuat pesan"));
        }
      } finally {
        if (seq === messageSeqRef.current && !silent) setMessagesLoading(false);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const initial = window.setTimeout(() => {
      if (!cancelled) void loadConversations();
    }, 0);
    const timer = window.setInterval(() => {
      if (!cancelled) void loadConversations(true);
    }, LIST_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [hydrated, loadConversations]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    const initial = window.setTimeout(() => {
      if (!cancelled) void loadMessages();
    }, 0);
    const timer = window.setInterval(() => {
      if (!cancelled) void loadMessages(true);
    }, MESSAGE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [selectedId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedId]);

  const refreshAll = () => {
    setListLoading(true);
    if (selectedId) setMessagesLoading(true);
    void loadConversations();
    void loadMessages();
  };

  const openConversation = (conversation: ApiChatConversation) => {
    // Klik percakapan yang sedang aktif tidak boleh mengosongkan thread;
    // polling pesan tetap berjalan seperti biasa.
    if (conversation.id === selectedId) {
      setSelected(conversation);
      return;
    }
    setSelected(conversation);
    setMessages([]);
    setMessagesError(null);
    setThreadError(null);
    setDraft("");
    setMessagesLoading(true);
  };

  const closeConversation = () => {
    setSelected(null);
    setMessages([]);
    setMessagesError(null);
    setThreadError(null);
    setMessagesLoading(false);
  };

  async function handleSend(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !selected) return;

    setSending(true);
    setThreadError(null);
    try {
      await api(`/chat/conversations/${selected.id}/messages`, {
        method: "POST",
        body: { body: text },
      });
      setDraft("");
      await Promise.all([loadMessages(true), loadConversations(true)]);
      window.dispatchEvent(new Event("semoet:chat-changed"));
    } catch (err) {
      setThreadError(apiErrorFrom(err, "Gagal mengirim pesan"));
    } finally {
      setSending(false);
    }
  }

  async function updateConversation(patch: {
    status?: string;
    category?: string;
  }) {
    if (!selected || savingMeta) return;

    setSavingMeta(true);
    setThreadError(null);
    try {
      const updated = await api<ApiChatConversation>(
        `/chat/conversations/${selected.id}`,
        { method: "PATCH", body: patch },
      );
      const merged = { ...selected, ...updated };
      setSelected(merged);
      setConversations((rows) =>
        rows.map((row) => (row.id === merged.id ? { ...row, ...merged } : row)),
      );
      window.dispatchEvent(new Event("semoet:chat-changed"));
    } catch (err) {
      setThreadError(apiErrorFrom(err, "Gagal memperbarui percakapan"));
    } finally {
      setSavingMeta(false);
    }
  }

  async function assignToMe() {
    if (!selected || !user || savingMeta) return;

    setSavingMeta(true);
    setThreadError(null);
    try {
      const updated = await api<ApiChatConversation>(
        `/admin/chat/conversations/${selected.id}/assign`,
        { method: "POST", body: { assignedStaffId: user.id } },
      );
      const merged = {
        ...selected,
        assignedStaffId: updated.assignedStaffId ?? user.id,
        assignedStaffName: updated.assignedStaffName ?? user.displayName,
      };
      setSelected(merged);
      setConversations((rows) =>
        rows.map((row) => (row.id === merged.id ? { ...row, ...merged } : row)),
      );
      window.dispatchEvent(new Event("semoet:chat-changed"));
    } catch (err) {
      setThreadError(apiErrorFrom(err, "Gagal menugaskan percakapan"));
    } finally {
      setSavingMeta(false);
    }
  }

  if (!hydrated) return <PageLoader label="Memuat chat pelanggan…" />;

  const assignedToMe = Boolean(
    selected && user && selected.assignedStaffId === user.id,
  );
  const waitingCount = conversations.filter(
    (conversation) => conversation.status === "waiting",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Chat Pelanggan"
        description="Lihat dan balas pertanyaan pelanggan dari web Semoet. Pesan baru dicek otomatis."
        actions={
          <>
            {waitingCount > 0 ? (
              <Badge tone="warning">
                {waitingCount} menunggu balasan
              </Badge>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={refreshAll}
              disabled={listLoading}
            >
              <RefreshCw
                size={14}
                className={listLoading ? "animate-spin" : undefined}
              />
              Muat ulang
            </Button>
          </>
        }
      />

      <div className="grid min-h-[calc(100dvh-12rem)] gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        {/* Daftar percakapan */}
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface",
            selected && "hidden lg:flex",
          )}
        >
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <Input
                value={search}
                onChange={(event) => {
                  setListLoading(true);
                  setSearch(event.target.value);
                }}
                placeholder="Cari nama, topik, atau pesan…"
                className="h-10 pl-9 text-xs"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) => {
                setListLoading(true);
                setStatusFilter(event.target.value);
              }}
              className="h-10 text-xs font-bold"
              aria-label="Filter status percakapan"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
            {listLoading && conversations.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted">
                <Loader2 size={20} className="animate-spin text-primary" />
                <p className="text-xs font-semibold">Memuat percakapan…</p>
              </div>
            ) : listError ? (
              <div className="p-3">
                <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                  {listError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => {
                    setListLoading(true);
                    void loadConversations();
                  }}
                >
                  Coba lagi
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-3">
                <EmptyState
                  icon={<Inbox size={20} />}
                  title="Belum ada percakapan"
                  description="Chat dari pelanggan web akan muncul di sini."
                />
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conversation) => {
                  const active = selected?.id === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => openConversation(conversation)}
                      className={cn(
                        "focus-ring w-full rounded-xl border p-3 text-left transition",
                        active
                          ? "border-primary/35 bg-primary-soft"
                          : "border-transparent hover:bg-milk",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-black text-primary">
                          {initials(conversation.userName) || (
                            <UserRound size={15} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-extrabold text-ink">
                              {customerName(conversation.userName)}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted">
                              {formatRelativeTime(
                                conversation.lastMessageAt ??
                                  conversation.createdAt,
                              )}
                            </span>
                          </div>
                          <p className="truncate text-[11px] font-semibold text-muted">
                            {conversation.topic}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-soft">
                            {conversation.lastMessagePreview ??
                              "Belum ada pesan"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge
                              tone={
                                STATUS_TONE[conversation.status] ?? "default"
                              }
                            >
                              {STATUS_LABEL[conversation.status] ??
                                conversation.status}
                            </Badge>
                            {conversation.category === "complaint" ? (
                              <Badge tone="danger">Keluhan</Badge>
                            ) : null}
                            {!conversation.assignedStaffId ? (
                              <Badge tone="info">Belum ditangani</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line px-3 py-2 text-[10px] font-semibold text-muted">
            {conversations.length} percakapan ditampilkan
          </div>
        </section>

        {/* Thread percakapan */}
        <section
          className={cn(
            "flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface",
            !selected && "hidden lg:flex",
          )}
        >
          {selected ? (
            <>
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={closeConversation}
                    aria-label="Kembali ke daftar chat"
                    className="focus-ring -ml-1 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary lg:hidden"
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-sm font-black text-primary sm:flex">
                    {initials(selected.userName) || <UserRound size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-extrabold text-ink">
                        {customerName(selected.userName)}
                      </h2>
                      <Badge tone={STATUS_TONE[selected.status] ?? "default"}>
                        {STATUS_LABEL[selected.status] ?? selected.status}
                      </Badge>
                      {selected.category === "complaint" ? (
                        <Badge tone="danger">Keluhan</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs font-semibold text-ink-soft">
                      {selected.topic}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {selected.userEmail ??
                        selected.userPhone ??
                        "Pelanggan web"}{" "}
                      · {selected.messageCount} pesan
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[125px] flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Status
                    </span>
                    <Select
                      value={selected.status}
                      disabled={savingMeta}
                      onChange={(event) =>
                        void updateConversation({ status: event.target.value })
                      }
                      className="h-9 text-xs font-bold"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex min-w-[125px] flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Kategori
                    </span>
                    <Select
                      value={selected.category}
                      disabled={savingMeta}
                      onChange={(event) =>
                        void updateConversation({
                          category: event.target.value,
                        })
                      }
                      className="h-9 text-xs font-bold"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    size="sm"
                    variant={assignedToMe ? "secondary" : "outline"}
                    onClick={() => void assignToMe()}
                    disabled={savingMeta || !user || assignedToMe}
                    className="h-9"
                  >
                    {savingMeta
                      ? "Menyimpan…"
                      : assignedToMe
                        ? "Ditangani Anda"
                        : selected.assignedStaffName
                          ? "Ambil alih"
                          : "Tugaskan ke saya"}
                  </Button>
                </div>
              </div>

              <div className="thin-scroll flex-1 space-y-3 overflow-y-auto bg-milk/50 px-4 py-4">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted">
                    <Loader2 size={20} className="animate-spin text-primary" />
                    <p className="text-xs font-semibold">Memuat pesan…</p>
                  </div>
                ) : messagesError ? (
                  <div className="rounded-xl border border-danger/20 bg-danger/10 p-3">
                    <p className="text-xs font-semibold text-danger">
                      {messagesError}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        setMessagesLoading(true);
                        void loadMessages();
                      }}
                    >
                      Coba lagi
                    </Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-40 items-center justify-center">
                    <EmptyState
                      icon={<MessageCircle size={20} />}
                      title="Belum ada pesan"
                      description="Tulis balasan pertama untuk pelanggan ini."
                    />
                  </div>
                ) : (
                  messages.map((message) => {
                    const isStaff = message.senderType === "staff";
                    const isSystem = message.senderType === "system";

                    if (isSystem) {
                      return (
                        <div key={message.id} className="flex justify-center">
                          <p className="max-w-[85%] rounded-full bg-cream px-3 py-1 text-center text-[10px] font-semibold text-muted">
                            {message.body}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex",
                          isStaff ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            isStaff
                              ? "bg-primary text-white"
                              : "border border-line bg-surface text-ink",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {message.body}
                          </p>
                          <div
                            className={cn(
                              "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]",
                              isStaff ? "text-white/70" : "text-muted",
                            )}
                          >
                            <span>
                              {senderLabel(message)} ·{" "}
                              {formatDateTime(message.createdAt)}
                            </span>
                            {isStaff ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5",
                                  message.readAt
                                    ? "font-bold text-white"
                                    : "text-white/70",
                                )}
                                title={
                                  message.readAt
                                    ? `Dibaca ${formatDateTime(message.readAt)}`
                                    : message.deliveredAt
                                      ? `Terkirim ${formatDateTime(message.deliveredAt)}`
                                      : "Terkirim"
                                }
                              >
                                <CheckCheck size={12} aria-hidden="true" />
                                {message.readAt ? "Dibaca" : "Terkirim"}
                              </span>
                            ) : null}
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
                className="border-t border-line p-3"
              >
                {threadError ? (
                  <p className="mb-2 rounded-lg border border-danger/20 bg-danger/10 px-3 py-1.5 text-[11px] font-semibold text-danger">
                    {threadError}
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <TextArea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={2}
                    placeholder="Tulis balasan… (Enter kirim, Shift+Enter baris baru)"
                    className="min-h-[48px] flex-1 text-xs"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="h-12"
                  >
                    {sending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    {sending ? "Mengirim" : "Kirim"}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted">
                  Pesan dibalas sebagai {user?.displayName ?? "staff"}. Status
                  otomatis menjadi terbuka setelah dibalas.
                </p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={<MessageCircle size={22} />}
                title="Pilih percakapan"
                description="Riwayat pesan dan kolom balasan akan muncul di sini."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
