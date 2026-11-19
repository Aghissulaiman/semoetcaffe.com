"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { StarRatingInput } from "@/components/ui/star-rating-input";
import { TextField } from "@/components/ui/text-field";
import { apiErrorFrom } from "@/services/client";
import { createReview, updateReview } from "@/services/review.service";

import type { MyReview, OrderItem } from "@/types/api";

interface ReviewSheetProps {
  visible: boolean;
  item: OrderItem | null;
  orderNumber: string;
  existing?: MyReview | null;
  onClose: () => void;
  onSaved: (review: MyReview) => void;
}

/** Form ulasan per item pesanan yang sudah selesai. */
export function ReviewSheet({
  visible,
  item,
  orderNumber,
  existing,
  onClose,
  onSaved,
}: ReviewSheetProps) {
  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFoodRating(existing?.foodRating ?? 0);
    setServiceRating(existing?.serviceRating ?? 0);
    setSpeedRating(existing?.speedRating ?? 0);
    setText(existing?.text ?? "");
    setError(null);
  }, [visible, item?.id, existing]);

  const submit = async () => {
    if (!item) return;
    if (foodRating === 0 && serviceRating === 0 && speedRating === 0) {
      setError("Pilih minimal satu rating bintang.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        foodRating: foodRating || undefined,
        serviceRating: serviceRating || undefined,
        speedRating: speedRating || undefined,
        reviewText: text.trim() || null,
      };
      const saved = existing
        ? await updateReview(existing.id, payload)
        : await createReview({ orderItemId: item.id, ...payload });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal menyimpan ulasan"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={existing ? "Ubah Ulasan" : "Beri Ulasan"}
      subtitle={item ? `${item.productName} · ${orderNumber}` : orderNumber}
      icon={Star}
      footer={
        <div className="flex flex-col gap-2">
          {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}
          <Button
            title={existing ? "Simpan Perubahan" : "Kirim Ulasan"}
            onClick={() => void submit()}
            loading={busy}
            disabled={!item}
          />
        </div>
      }>
      <div className="flex flex-col gap-5">
        <p className="text-[13px] leading-5 text-muted">
          Ulasanmu membantu kami menjaga kualitas menu dan pelayanan. Kamu bisa
          menilai makanan, pelayanan, dan kecepatan secara terpisah.
        </p>

        <div className="flex flex-col gap-4 rounded-[16px] border border-line p-3.5">
          <StarRatingInput
            label="Makanan / minuman"
            value={foodRating}
            onChange={setFoodRating}
            hint="Rasa, penyajian, dan kesesuaian pesanan."
          />
          <StarRatingInput
            label="Pelayanan"
            value={serviceRating}
            onChange={setServiceRating}
            hint="Keramahan staf dan pengalaman saat mengambil pesanan."
          />
          <StarRatingInput
            label="Kecepatan"
            value={speedRating}
            onChange={setSpeedRating}
            hint="Kecepatan pesanan disiapkan."
          />
        </div>

        <TextField
          id="review-text"
          label="Ceritakan pengalamanmu (opsional)"
          multiline
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder="Contoh: kopinya pas, pelayanan cepat, dan kemasannya rapi."
          hint={`${text.length}/2000 karakter`}
        />
      </div>
    </BottomSheet>
  );
}
