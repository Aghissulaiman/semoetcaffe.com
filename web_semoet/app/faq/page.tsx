"use client";

import { HelpCircle, MessageCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FAQ_CATEGORIES, FAQ_ENTRIES } from "@/lib/faq";

export default function FaqPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FAQ_ENTRIES.filter((entry) => {
      const matchesCategory = !categoryId || entry.categoryId === categoryId;
      const matchesQuery =
        !needle ||
        entry.question.toLowerCase().includes(needle) ||
        entry.answer.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [categoryId, query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <HelpCircle size={23} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-ink">Pusat Bantuan</h1>
          <p className="text-xs leading-5 text-muted">
            Jawaban cepat seputar pesanan, pembayaran, reservasi, dan ulasan.
          </p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Cari pertanyaan"
          placeholder="Cari pertanyaan, mis. refund atau ulasan…"
          className="h-12 w-full rounded-[14px] border-[1.5px] border-line bg-surface pl-10 pr-4 text-[14px] text-ink outline-none transition placeholder:text-muted/80 focus:border-primary"
        />
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-0.5">
        <Chip
          label="Semua"
          size="sm"
          active={!categoryId}
          onClick={() => setCategoryId(null)}
        />
        {FAQ_CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            label={category.label}
            size="sm"
            active={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
          />
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {filtered.map((entry) => {
            const category = FAQ_CATEGORIES.find((item) => item.id === entry.categoryId);
            return (
              <Accordion
                key={entry.id}
                title={entry.question}
                subtitle={category?.label}>
                <p className="whitespace-pre-line text-[13px] leading-6 text-muted">
                  {entry.answer}
                </p>
              </Accordion>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="Pertanyaan tidak ditemukan"
          description="Coba kata kunci lain atau tanyakan langsung ke tim support melalui chat."
          actionLabel="Buka Chat"
          onAction={() => router.push("/chat")}
        />
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-[18px] border border-primary/20 bg-primary-soft/60 p-4">
        <div>
          <h2 className="text-[15px] font-extrabold text-ink">Belum menemukan jawaban?</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            Tim Semoet Cafe bisa membantu cek pesanan, pembayaran, atau kendala
            lain lewat chat.
          </p>
        </div>
        <Button
          title="Chat dengan Support"
          icon={MessageCircle}
          onClick={() => router.push("/chat")}
        />
      </div>
    </div>
  );
}
