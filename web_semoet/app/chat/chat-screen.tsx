"use client";

import {
  ArrowLeft,
  HelpCircle,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  createConversation,
  getConversation,
  listMessages,
  listMyConversations,
  sendMessage,
} from "@/services/chat.service";
import { apiErrorFrom } from "@/services/client";
import { useAuthStore } from "@/store/auth-store";

import type { ChatConversation, ChatMessage } from "@/types/api";

const LIST_POLL_MS = 15_000;
const MESSAGE_POLL_MS = 5_000;

const STATUS_LABEL: Record<string, string> = {
  open: "Terbuka",
  waiting: "Menunggu balasan",
  resolved: "Selesai",
  closed: "Ditutup",
};

const STATUS_TONE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  open: "info",
  waiting: "warning",
  resolved: "success",
  closed: "danger",
};

const CLOSED_STATUSES = ["resolved", "closed"];

export default function ChatScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryConversationId = searchParams.get("conversation");
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "authenticated";

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageReloadKey, setMessageReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [startOpen, setStartOpen] = useState(false);
  const [startTopic, setStartTopic] = useState("");
  const [startMessage, setStartMessage] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const selectedRef = useRef<ChatConversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadConversations = useCallback(async () => {
    if (!isAuthenticated) return;
    const result = await listMyConversations({ limit: 50 });
    setConversations(result.items);

    const current = selectedRef.current;
    if (current) {
      const updated = result.items.find((conversation) => conversation.id === current.id);
      setSelected(updated ?? null);
    }
  }, [isAuthenticated]);

  // Muat daftar percakapan sekali, lalu pilih percakapan dari URL (mis. setelah
  // lapor masalah) atau percakapan terbaru.
  useEffect(() => {
    if (!isAuthenticated) {
      setListLoading(false);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setListLoading(true);
      setListError(null);
      try {
        const result = await listMyConversations({ limit: 50 });
        let chosen: ChatConversation | null = null;

        if (queryConversationId) {
          chosen =
            result.items.find((conversation) => conversation.id === queryConversationId) ?? null;
          if (!chosen) {
            chosen = await getConversation(queryConversationId).catch(() => null);
          }
        }

        if (!chosen) chosen = result.items[0] ?? null;

        if (!cancelled) {
          setConversations(result.items);
          setSelected(chosen);
        }
      } catch (err) {
        if (!cancelled) setListError(apiErrorFrom(err, "Gagal memuat chat"));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, queryConversationId]);

  // Polling daftar percakapan supaya balasan/status baru terlihat tanpa reload.
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      void loadConversations().catch(() => {
        // Polling tidak boleh mengganggu percakapan yang sedang dibaca.
      });
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, loadConversations]);

  const selectedId = selected?.id;

  // Muat pesan saat percakapan berubah, lalu polling tiap 5 detik.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const conversationId = selectedId;

    async function load(showSpinner: boolean) {
      if (showSpinner) setMessageLoading(true);
      try {
        const result = await listMessages(conversationId, { limit: 100 });
        if (!cancelled) {
          setMessages(result.items);
          setMessageError(null);
        }
      } catch (err) {
        if (!cancelled) setMessageError(apiErrorFrom(err, "Gagal memuat pesan"));
      } finally {
        if (!cancelled && showSpinner) setMessageLoading(false);
      }
    }

    void load(true);
    const timer = setInterval(() => void load(false), MESSAGE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [messageReloadKey, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter(
      (conversation) =>
        conversation.topic.toLowerCase().includes(needle) ||
        (conversation.lastMessagePreview ?? "").toLowerCase().includes(needle),
    );
  }, [conversations, search]);

  const canReply = selected ? !CLOSED_STATUSES.includes(selected.status) : false;

  const openStart = () => {
    setStartError(null);
    setStartOpen(true);
  };

  const selectConversation = (conversation: ChatConversation) => {
    setSelected(conversation);
    setDraft("");
    setMessageError(null);
    router.replace(`/chat?conversation=${conversation.id}`, { scroll: false });
  };

  const refresh = async () => {
    setRefreshing(true);
    setListError(null);
    try {
      await loadConversations();
    } catch (err) {
      setListError(apiErrorFrom(err, "Gagal memuat chat"));
    } finally {
      setRefreshing(false);
    }
  };

  const submitMessage = async () => {
    const body = draft.trim();
    if (!body || !selected || sending || !canReply) return;

    setSending(true);
    setMessageError(null);
    try {
      const sent = await sendMessage(selected.id, body);
      setDraft("");
      setMessages((prev) => [...prev, sent]);

      const nextPreview = body.length > 140 ? `${body.slice(0, 140)}...` : body;
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selected.id
            ? {
                ...conversation,
                lastMessagePreview: nextPreview,
                lastMessageAt: sent.createdAt,
                status: "waiting",
              }
            : conversation,
        ),
      );
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              lastMessagePreview: nextPreview,
              lastMessageAt: sent.createdAt,
              status: "waiting",
            }
          : prev,
      );
    } catch (err) {
      setMessageError(apiErrorFrom(err, "Gagal mengirim pesan"));
    } finally {
      setSending(false);
    }
  };

  const startChat = async () => {
    const topic = startTopic.trim();
    const initialMessage = startMessage.trim();

    if (topic.length < 3) {
      setStartError("Topik minimal 3 karakter.");
      return;
    }
    if (!initialMessage) {
      setStartError("Tulis pesan terlebih dahulu.");
      return;
    }

    setStarting(true);
    setStartError(null);
    try {
      const conversation = await createConversation({
        topic,
        category: "general",
        initialMessage,
      });
      setStartOpen(false);
      setStartTopic("");
      setStartMessage("");
      setConversations((prev) => [
        conversation,
        ...prev.filter((item) => item.id !== conversation.id),
      ]);
      setSelected(conversation);
      setDraft("");
      setMessageError(null);
      router.replace(`/chat?conversation=${conversation.id}`, { scroll: false });
    } catch (err) {
      setStartError(apiErrorFrom(err, "Gagal memulai percakapan"));
    } finally {
      setStarting(false);
    }
  };

  if (status === "loading") return <Loader label="Memuat chat…" />;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Masuk untuk chat support"
        description="Masuk ke akunmu agar riwayat percakapan dan laporan pesanan tersimpan."
        actionLabel="Masuk / Daftar"
        onAction={() => router.push("/auth/login")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <ScreenHeading
          title="Bantuan"
          subtitle="Chat dengan tim Semoet Cafe"
          onBack={() => router.back()}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <Link
            href="/faq"
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-bold text-primary transition hover:bg-cream focus-ring">
            <HelpCircle size={15} />
            FAQ
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Muat ulang chat"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section
          className={cn(
            "flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-surface",
            selected && "hidden lg:flex",
          )}>
          <div className="border-b border-line p-3">
            <Button
              title="Chat Baru"
              icon={Plus}
              size="sm"
              onClick={openStart}
            />
            <div className="relative mt-2">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Cari percakapan"
                placeholder="Cari percakapan…"
                className="h-10 w-full rounded-full border border-line bg-milk/60 pl-9 pr-3 text-[13px] text-ink outline-none transition placeholder:text-muted/80 focus:border-primary"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {listLoading ? (
              <Loader label="Memuat chat…" fullscreen={false} />
            ) : listError ? (
              <div className="p-2">
                <ErrorState message={listError} onRetry={() => void refresh()} />
              </div>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={search ? "Percakapan tidak ditemukan" : "Belum ada percakapan"}
                description={
                  search
                    ? "Coba kata kunci lain."
                    : "Mulai chat untuk bertanya atau melaporkan kendala pesanan."
                }
                actionLabel={search ? undefined : "Chat Baru"}
                onAction={search ? undefined : openStart}
                className="py-10"
              />
            ) : (
              <div className="flex flex-col gap-1">
                {filteredConversations.map((conversation) => {
                  const active = selected?.id === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-[14px] border p-3 text-left transition focus-ring",
                        active
                          ? "border-primary/35 bg-primary-soft"
                          : "border-transparent hover:bg-milk",
                      )}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-ink">
                          {conversation.topic}
                        </p>
                        <Badge
                          label={STATUS_LABEL[conversation.status] ?? conversation.status}
                          tone={STATUS_TONE[conversation.status] ?? "default"}
                          size="sm"
                        />
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-4 text-muted">
                        {conversation.lastMessagePreview ?? "Belum ada pesan"}
                      </p>
                      <p className="text-[10px] text-muted">
                        {formatDateTime(
                          conversation.lastMessageAt ??
                            conversation.updatedAt ??
                            conversation.createdAt,
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line px-3 py-2 text-[10px] font-semibold text-muted">
            {conversations.length} percakapan
          </div>
        </section>

        <section
          className={cn(
            "flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface",
            !selected && "hidden lg:flex",
          )}>
          {selected ? (
            <>
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Kembali ke daftar chat"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary lg:hidden">
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-extrabold text-ink">
                      {selected.topic}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge
                        label={STATUS_LABEL[selected.status] ?? selected.status}
                        tone={STATUS_TONE[selected.status] ?? "default"}
                        size="sm"
                      />
                      <span className="text-[11px] text-muted">
                        {selected.assignedStaffName
                          ? `Ditangani ${selected.assignedStaffName}`
                          : "Menunggu staff"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-milk/40 p-3.5">
                {messageLoading ? (
                  <Loader label="Memuat pesan…" fullscreen={false} />
                ) : messageError && messages.length === 0 ? (
                  <ErrorState
                    message={messageError}
                    onRetry={() => setMessageReloadKey((key) => key + 1)}
                  />
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <MessageCircle size={22} />
                    </span>
                    <p className="text-sm font-bold text-ink">Belum ada pesan</p>
                    <p className="text-xs text-muted">
                      Tulis pesan pertama untuk memulai percakapan.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {messages.map((message) => {
                      const mine = message.senderType === "customer";
                      return (
                        <div
                          key={message.id}
                          className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-5",
                              mine
                                ? "rounded-br-md bg-primary text-white"
                                : "rounded-bl-md border border-line bg-surface text-ink",
                            )}>
                            {!mine ? (
                              <p className="mb-0.5 text-[10px] font-bold text-muted">
                                {message.senderName ?? "Staff Semoet"}
                              </p>
                            ) : null}
                            <p className="whitespace-pre-line">{message.body}</p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                mine ? "text-white/70" : "text-muted",
                              )}>
                              {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {canReply ? (
                <div className="border-t border-line p-3">
                  {messageError && messages.length > 0 ? (
                    <p className="mb-2 text-xs font-semibold text-danger">{messageError}</p>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void submitMessage();
                        }
                      }}
                      rows={2}
                      maxLength={4000}
                      aria-label="Tulis pesan"
                      placeholder="Tulis pesan… (Enter untuk kirim)"
                      className="min-h-11 flex-1 resize-none rounded-[14px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[13px] leading-5 text-ink outline-none transition placeholder:text-muted/80 focus:border-primary"
                    />
                    <Button
                      icon={sending ? Loader2 : Send}
                      onClick={() => void submitMessage()}
                      loading={sending}
                      disabled={!draft.trim()}
                      fullWidth={false}
                      aria-label="Kirim pesan"
                      className="h-11 w-11 rounded-full px-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="border-t border-line p-3">
                  <div className="rounded-[14px] bg-primary-soft/70 p-3 text-center">
                    <p className="text-xs font-semibold text-ink-soft">
                      Percakapan ini sudah ditutup.
                    </p>
                    <button
                      type="button"
                      onClick={openStart}
                      className="mt-1 text-xs font-bold text-primary underline-offset-2 hover:underline">
                      Mulai percakapan baru
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Pilih percakapan"
              description="Pilih percakapan di samping atau mulai chat baru dengan tim support."
              actionLabel="Chat Baru"
              onAction={openStart}
              className="my-auto"
            />
          )}
        </section>
      </div>

      <BottomSheet
        visible={startOpen}
        onClose={() => setStartOpen(false)}
        title="Mulai Percakapan"
        subtitle="Tim support akan membalas melalui chat ini"
        icon={MessageCircle}
        footer={
          <div className="flex flex-col gap-2">
            {startError ? (
              <p className="text-xs font-semibold text-danger">{startError}</p>
            ) : null}
            <Button
              title="Mulai Chat"
              onClick={() => void startChat()}
              loading={starting}
            />
          </div>
        }>
        <div className="flex flex-col gap-4">
          <TextField
            id="chat-topic"
            label="Topik"
            value={startTopic}
            onChange={(event) => setStartTopic(event.target.value)}
            maxLength={150}
            placeholder="Contoh: Tanya pesanan catering"
          />
          <TextField
            id="chat-message"
            label="Pesan"
            multiline
            rows={5}
            value={startMessage}
            onChange={(event) => setStartMessage(event.target.value)}
            maxLength={2000}
            hint={`${startMessage.length}/2000 karakter`}
            placeholder="Tulis pertanyaan atau kendala yang ingin kamu sampaikan."
          />
        </div>
      </BottomSheet>
    </div>
  );
}
