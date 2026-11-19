import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-coffee-milk px-6 text-center dark:bg-coffee-night">
      <p className="text-7xl font-bold text-coffee-brown dark:text-coffee-caramel">404</p>
      <h1 className="text-2xl font-semibold text-coffee-espresso dark:text-coffee-cream">
        Halaman tidak ditemukan
      </h1>
      <p className="max-w-md text-sm text-coffee-muted">
        Halaman yang kamu cari tidak tersedia atau sudah dipindahkan.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-coffee-brown px-5 py-2.5 text-sm font-medium text-white transition hover:bg-coffee-dark"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
