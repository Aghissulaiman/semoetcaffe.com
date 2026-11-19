"use client";

import { clearSessionCache } from "@/hooks/useSession";

/** Login via proxy BFF. Melempar Error berisi pesan dari server bila gagal. */
export async function login(
  identifier: string,
  password: string,
): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    credentials: "same-origin",
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(json?.error?.message ?? "Email/telepon atau kata sandi salah");
  }
}

/** Logout: cabut sesi backend + hapus cookie, lalu kembali ke halaman masuk. */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allDevices: false }),
      credentials: "same-origin",
    });
  } finally {
    clearSessionCache();
    if (typeof window !== "undefined") {
      // Redirect keras untuk mereset seluruh state klien setelah logout.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/signin";
    }
  }
}
