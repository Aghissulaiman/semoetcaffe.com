"use client";

import { useSession } from "@/hooks/useSession";
import { canAccessPath } from "@/lib/access";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Penjaga halaman berbasis izin peran. Backend tetap memvalidasi setiap
 * endpoint; guard ini hanya mencegah pengguna membuka halaman yang menunya
 * memang tidak tersedia untuk perannya.
 */
export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const allowed = Boolean(me) && canAccessPath(me?.permissions, pathname);

  useEffect(() => {
    if (loading || !me) return;
    if (!canAccessPath(me.permissions, pathname)) {
      router.replace("/akses-ditolak");
    }
  }, [loading, me, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-coffee-linen border-t-coffee-brown dark:border-coffee-night-border dark:border-t-coffee-caramel" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-theme-sm text-coffee-muted">
          Sesi tidak ditemukan. Silakan masuk kembali.
        </p>
        <a
          href="/signin"
          className="text-theme-sm font-semibold text-coffee-brown underline dark:text-coffee-caramel"
        >
          Masuk ulang
        </a>
      </div>
    );
  }

  return allowed ? <>{children}</> : null;
}
