import Link from "next/link";

import { Coffee } from "lucide-react";

/** Halaman 404 yang tetap memakai tema Semoet Cafe. */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Coffee size={30} />
      </div>
      <p className="text-[13px] font-extrabold tracking-[0.18em] text-muted">404</p>
      <h1 className="text-xl font-black text-ink">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        Tautan yang kamu buka sudah tidak ada atau alamatnya salah.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/menu"
          className="rounded-full bg-primary px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-primary-dark focus-ring">
          Lihat menu
        </Link>
        <Link
          href="/"
          className="rounded-full bg-primary-soft px-4 py-2.5 text-[13px] font-bold text-primary transition hover:bg-cream focus-ring">
          Ke beranda
        </Link>
      </div>
    </div>
  );
}
