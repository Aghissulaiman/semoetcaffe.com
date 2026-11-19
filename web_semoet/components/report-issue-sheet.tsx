"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatDateTime } from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { createConversation } from "@/services/chat.service";

import type { OrderDetail } from "@/types/api";

interface ReportIssueSheetProps {
  visible: boolean;
  order: OrderDetail;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

function defaultMessage(order: OrderDetail): string {
  return `Halo tim Semoet Cafe, saya ingin melaporkan masalah pada pesanan ${order.orderNumber} (${formatDateTime(order.placedAt)}).\n\nMasalah yang saya alami: `;
}

/** Form laporan masalah yang langsung membuat percakapan chat kategori keluhan. */
export function ReportIssueSheet({
  visible,
  order,
  onClose,
  onCreated,
}: ReportIssueSheetProps) {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTopic(`Masalah pesanan ${order.orderNumber}`);
    setMessage(defaultMessage(order));
    setError(null);
  }, [visible, order]);

  const submit = async () => {
    const trimmedTopic = topic.trim();
    const trimmedMessage = message.trim();

    if (trimmedTopic.length < 3) {
      setError("Topik minimal 3 karakter.");
      return;
    }
    if (trimmedMessage.length < 10) {
      setError("Ceritakan masalahmu minimal 10 karakter agar tim support bisa membantu.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const conversation = await createConversation({
        topic: trimmedTopic,
        category: "complaint",
        initialMessage: trimmedMessage,
      });
      onCreated(conversation.id);
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal mengirim laporan"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Laporkan Masalah"
      subtitle={`Pesanan ${order.orderNumber}`}
      icon={AlertTriangle}
      footer={
        <div className="flex flex-col gap-2">
          {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}
          <Button
            title="Kirim ke Chat Support"
            onClick={() => void submit()}
            loading={busy}
          />
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="rounded-[14px] border border-warning/30 bg-[#fbeedd]/50 p-3 text-[13px] leading-5 text-ink-soft">
          Laporan ini akan masuk ke chat support sebagai keluhan. Tim Semoet Cafe
          akan membalas melalui halaman chat.
        </div>

        <TextField
          id="report-topic"
          label="Topik"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={150}
          placeholder="Contoh: Pesanan kurang lengkap"
        />

        <TextField
          id="report-message"
          label="Detail masalah"
          multiline
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          hint={`${message.length}/2000 karakter`}
          placeholder="Jelaskan apa yang terjadi, termasuk item yang bermasalah bila ada."
        />
      </div>
    </BottomSheet>
  );
}
