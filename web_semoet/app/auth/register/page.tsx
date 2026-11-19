"use client";

/**
 * Daftar — POST /auth/register (email atau nomor telepon + password).
 */
import { Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ApiError, apiErrorFrom } from "@/services/client";
import { useAuthStore } from "@/store/auth-store";

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);

  const [displayName, setDisplayName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/");
  };

  const submit = async () => {
    const value = contact.trim();
    const nextErrors: Record<string, string> = {};
    if (displayName.trim().length < 2) nextErrors.displayName = "Nama minimal 2 karakter";
    if (!EMAIL_REGEX.test(value) && !PHONE_REGEX.test(value)) {
      nextErrors.contact = "Masukkan email atau nomor telepon yang valid";
    }
    if (password.length < 8) nextErrors.password = "Password minimal 8 karakter";
    else if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      nextErrors.password = "Harus mengandung huruf kecil, huruf besar, dan angka";
    }
    if (password !== confirmPassword) nextErrors.confirmPassword = "Password tidak sama";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await register({
        displayName: displayName.trim(),
        password,
        ...(EMAIL_REGEX.test(value) ? { email: value } : { phoneE164: value }),
        marketingOptIn: true,
        deviceLabel: "web_semoet",
      });
      router.replace("/");
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : apiErrorFrom(error, "Gagal mendaftar"));
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Buat akun ☕"
      subtitle="Satu akun untuk pesan, kumpulkan poin loyalitas, dan nikmati promo Semoet Cafe."
      error={formError}
      onBack={goBack}
      footer={
        <p className="text-center text-[13px] text-muted">
          Sudah punya akun?{" "}
          <Link href="/auth/login" className="font-extrabold text-primary hover:underline">
            Masuk
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
          label="Nama lengkap"
          icon={User}
          placeholder="Masukkan nama lengkap"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={errors.displayName}
        />
        <TextField
          label="Email atau nomor telepon"
          icon={Mail}
          placeholder="nama@email.com / 0812…"
          autoComplete="username"
          inputMode="email"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          error={errors.contact}
        />
        <TextField
          label="Password"
          icon={Lock}
          placeholder="Minimal 8 karakter"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          hint="Minimal 8 karakter, kombinasi huruf besar, huruf kecil, dan angka."
        />
        <TextField
          label="Ulangi password"
          icon={Lock}
          placeholder="••••••••"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />

        <Button title="Daftar" type="submit" loading={submitting} size="lg" />
      </form>
    </AuthShell>
  );
}
