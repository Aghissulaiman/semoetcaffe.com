"use client";

/**
 * Kerangka layar autentikasi (Masuk / Daftar).
 *
 * Tanpa navbar: hanya tombol kembali mengambang, hero brand, lalu kartu form
 * putih. Tetap konsisten dengan tema dominan putih + aksen cokelat.
 */
import { ChevronLeft, Coffee, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  error?: string | null;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, error, onBack, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-24 h-[230px] w-[230px] rounded-full bg-primary-soft" />
        <div className="absolute -bottom-32 -left-24 h-[250px] w-[250px] rounded-full bg-primary-soft/70" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-10 pt-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="mt-2 flex h-[42px] w-[42px] items-center justify-center rounded-full border border-line bg-surface text-primary transition hover:bg-primary-soft focus-ring">
          <ChevronLeft size={20} />
        </button>

        <div className="flex flex-col items-center gap-2.5 pt-0.5">
          <div className="flex h-[84px] w-[84px] items-center justify-center rounded-[28px] bg-primary text-white shadow-[0_10px_20px_rgba(42,26,17,0.18)]">
            <Coffee size={40} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Semoet Cafe</h1>
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-gold" />
            <p className="text-[13px] text-muted">Ngopi enak, seusai hati</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-5 shadow-[0_8px_20px_rgba(42,26,17,0.08)]">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black text-ink">{title}</h2>
            <p className="text-[13px] leading-[19px] text-muted">{subtitle}</p>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-[14px] bg-[#f7e4e0] p-3">
              <span className="mt-0.5 text-danger">⚠</span>
              <p className="flex-1 text-[13px] leading-[18px] text-danger">{error}</p>
            </div>
          ) : null}

          {children}

          {footer ? <div className="mt-0.5">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
