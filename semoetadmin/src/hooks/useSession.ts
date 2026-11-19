"use client";

import type { AuthMe } from "@/types/api";
import { useEffect, useState } from "react";

let cache: AuthMe | null = null;
let inflight: Promise<AuthMe> | null = null;

async function loadSession(): Promise<AuthMe> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/auth/session", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("unauthorized");
        const json = (await res.json()) as { data: AuthMe };
        cache = json.data;
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Kosongkan cache sesi (dipakai saat logout). */
export function clearSessionCache() {
  cache = null;
}

/**
 * Ambil sesi user yang sedang login dari /api/auth/session (dengan cache modul).
 */
export function useSession() {
  const [me, setMe] = useState<AuthMe | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let active = true;
    loadSession()
      .then((session) => {
        if (!active) return;
        setMe(session);
      })
      .catch(() => {
        // Biarkan null; proxy akan mengarahkan ke /signin bila perlu.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { me, loading };
}
