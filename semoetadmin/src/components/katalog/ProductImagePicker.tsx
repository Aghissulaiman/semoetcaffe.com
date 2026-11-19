"use client";

import { ApiError, apiPost } from "@/lib/client";
import { fieldLabelClass } from "@/lib/ui";
import type { UploadedImage } from "@/types/api";
import { useRef, useState } from "react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

interface ProductImagePickerProps {
  /** URL gambar saat ini (dari server atau hasil unggahan terbaru). */
  imageUrl: string | null;
  disabled?: boolean;
  onUploaded: (image: UploadedImage) => void;
  onRemove: () => void;
}

/**
 * Pemilih gambar produk. Berkas dibaca sebagai data URL lalu dikirim ke backend
 * (`POST /admin/uploads/images`) yang mengunggahnya ke object storage Supabase —
 * service role key tidak pernah menyentuh browser.
 */
export default function ProductImagePicker({
  imageUrl,
  disabled,
  onUploaded,
  onRemove,
}: ProductImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Berkas harus berupa gambar (JPG, PNG, WebP, GIF, atau AVIF).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await apiPost<UploadedImage>("/admin/uploads/images", {
        data: dataUrl,
        contentType: file.type,
      });
      onUploaded(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah gambar");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const pick = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <span className={fieldLabelClass}>Gambar Produk</span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {imageUrl ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-coffee-linen bg-coffee-milk dark:border-coffee-night-border dark:bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Pratinjau gambar produk" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || uploading}
              className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk disabled:opacity-50 dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
            >
              {uploading ? "Mengunggah…" : "Ganti Gambar"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled || uploading}
              className="rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:opacity-50"
            >
              Hapus Gambar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || uploading}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-coffee-linen bg-coffee-milk/40 px-4 py-8 text-center transition-colors hover:bg-coffee-milk disabled:opacity-50 dark:border-coffee-night-border dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream/80">
            {uploading ? "Mengunggah…" : "Pilih Gambar"}
          </span>
          <span className="text-theme-xs text-coffee-muted">JPG, PNG, WebP, GIF, atau AVIF · maks. 5 MB</span>
        </button>
      )}

      {error && <p className="text-theme-xs text-coffee-danger">{error}</p>}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca berkas"));
    reader.readAsDataURL(file);
  });
}
