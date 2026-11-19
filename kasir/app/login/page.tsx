"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoginScreen } from "@/components/login-screen";
import { PageLoader } from "@/components/ui";
import { useKasir } from "@/lib/store";

export default function LoginPage() {
  const { authStatus } = useKasir();
  const router = useRouter();

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    // Setelah login, kembali ke halaman yang tadi ingin dibuka. Hanya terima
    // path internal supaya query tidak bisa dipakai untuk open redirect.
    const next = new URLSearchParams(window.location.search).get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";
    router.replace(target);
  }, [authStatus, router]);

  if (authStatus === "authenticated") {
    return <PageLoader label="Mengalihkan ke kasir…" />;
  }

  return <LoginScreen />;
}
