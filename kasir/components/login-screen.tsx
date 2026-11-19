"use client";

import { Coffee, Loader2, LockKeyhole, LogIn, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import {
  requestNotificationPermission,
  unlockNotificationAudio,
} from "@/lib/notifications";
import { useKasir } from "@/lib/store";

export function LoginScreen() {
  const { login } = useKasir();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    // Login adalah gesture pengguna: pakai kesempatan ini untuk membuka
    // izin notifikasi dan audio agar pesanan baru bisa langsung berbunyi.
    void unlockNotificationAudio();
    void requestNotificationPermission();

    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(apiErrorFrom(err, "Email/telepon atau kata sandi salah"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-white shadow-lg shadow-primary/25">
            <Coffee size={30} />
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-ink">
            Semoet Kasir
          </h1>
          <p className="mt-1 text-sm text-muted">
            Masuk dengan akun staf untuk membuka kasir.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-line bg-surface p-5 shadow-sm"
        >
          <label className="block text-xs font-extrabold uppercase tracking-wider text-muted">
            Email atau telepon
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-milk px-3">
            <Mail size={16} className="shrink-0 text-muted" />
            <input
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="nama@semoetcafe.com"
              className="h-11 w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted"
            />
          </div>

          <label className="mt-4 block text-xs font-extrabold uppercase tracking-wider text-muted">
            Kata sandi
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-milk px-3">
            <LockKeyhole size={16} className="shrink-0 text-muted" />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="h-11 w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted"
            />
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="mt-5 w-full"
            disabled={submitting || !identifier.trim() || !password}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            {submitting ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          Data pesanan, reservasi, dan laporan diambil langsung dari server
          Semoet Cafe.
        </p>
      </div>
    </div>
  );
}
