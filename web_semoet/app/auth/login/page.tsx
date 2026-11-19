"use client";

/**
 * Login — POST /auth/login { identifier, password }.
 */
import { Lock, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ApiError, apiErrorFrom } from "@/services/client";
import { useAuthStore } from "@/store/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/");
  };

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (identifier.trim().length < 3) nextErrors.identifier = "Isi email atau nomor telepon";
    if (password.length < 1) nextErrors.password = "Password wajib diisi";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await login(identifier.trim(), password);
      router.replace("/");
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : apiErrorFrom(error, "Gagal masuk"));
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Selamat datang kembali 👋"
      subtitle="Masuk untuk pesan kopi favoritmu, kumpulkan poin, dan pakai voucher."
      error={formError}
      onBack={goBack}
      footer={
        <p className="text-center text-[13px] text-muted">
          Belum punya akun?{" "}
          <Link href="/auth/register" className="font-extrabold text-primary hover:underline">
            Daftar sekarang
          </Link>
        </p>
      }>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}>
        <TextField
          label="Email atau nomor telepon"
          icon={User}
          placeholder="nama@email.com / 0812…"
          autoComplete="username"
          inputMode="email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={errors.identifier}
        />
        <TextField
          label="Password"
          icon={Lock}
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />

        <Button title="Masuk" type="submit" loading={submitting} size="lg" />
      </form>
    </AuthShell>
  );
}
