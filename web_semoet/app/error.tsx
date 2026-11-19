"use client";

/**
 * Batas galat tingkat aplikasi.
 *
 * Tanpa berkas ini, error saat render di segmen mana pun akan menampilkan
 * layar putih. Dengan `error.tsx`, pengguna selalu mendapat pesan + tombol
 * coba lagi, dan error tetap tercatat di console.
 */
import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message =
    error instanceof Error && error.message
      ? error.message
      : "Terjadi kesalahan tak terduga. Coba muat ulang halaman.";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2 px-4 py-10">
      <ErrorState message={message} onRetry={retry} />
      <Link
        href="/"
        className="rounded-full bg-primary-soft px-4 py-2 text-[13px] font-bold text-primary transition hover:bg-cream focus-ring">
        Kembali ke beranda
      </Link>
    </div>
  );
}
