"use client";

import SemoetLogo from "@/components/common/SemoetLogo";
import { login } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-7 shadow-theme-lg sm:p-9 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <div className="mb-7 flex flex-col items-center gap-4 text-center">
        <SemoetLogo />
        <div>
          <h1 className="text-2xl font-semibold text-coffee-espresso dark:text-coffee-cream">
            Masuk ke Panel
          </h1>
          <p className="mt-1 text-theme-sm text-coffee-muted">
            Kelola penjualan & operasional Semoet Cafe
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-coffee-danger/30 bg-coffee-danger/10 px-4 py-3 text-theme-sm text-coffee-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="identifier"
            className="mb-1.5 block text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/80"
          >
            Email atau Nomor Telepon
          </label>
          <input
            id="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="admin@semoetcafe.com"
            className="h-11 w-full rounded-lg border border-coffee-linen bg-coffee-milk/40 px-4 text-theme-sm text-coffee-espresso outline-hidden transition focus:border-coffee-brown focus:ring-3 focus:ring-coffee-brown/15 dark:border-coffee-night-border dark:bg-coffee-night dark:text-coffee-cream dark:placeholder:text-coffee-muted"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/80"
          >
            Kata Sandi
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-lg border border-coffee-linen bg-coffee-milk/40 px-4 pe-12 text-theme-sm text-coffee-espresso outline-hidden transition focus:border-coffee-brown focus:ring-3 focus:ring-coffee-brown/15 dark:border-coffee-night-border dark:bg-coffee-night dark:text-coffee-cream dark:placeholder:text-coffee-muted"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-theme-xs font-medium text-coffee-muted transition-colors hover:text-coffee-brown"
            >
              {showPassword ? "Sembunyi" : "Lihat"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-coffee-brown text-theme-sm font-semibold text-coffee-milk transition-colors hover:bg-coffee-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Memproses…" : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-center text-theme-xs text-coffee-muted">
        Butuh bantuan akses?{" "}
        <Link href="/" className="font-medium text-coffee-brown hover:underline">
          Hubungi administrator
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-2xl border border-coffee-linen bg-white/60 dark:border-coffee-night-border dark:bg-coffee-night-soft" />
      }
    >
      <SignInForm />
    </Suspense>
  );
}
