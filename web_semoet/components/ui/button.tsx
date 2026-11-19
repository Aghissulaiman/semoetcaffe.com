"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "soft" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title?: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  soft: "bg-primary-soft text-primary hover:bg-cream",
  outline: "border border-primary text-primary hover:bg-primary-soft",
  ghost: "text-ink-soft hover:bg-primary-soft",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-[46px] px-5 text-[15px]",
  lg: "h-[54px] px-5 text-base",
};

/** Tombol utama aplikasi dengan palet kopi. */
export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  fullWidth = true,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const iconSize = size === "sm" ? 15 : size === "lg" ? 18 : 17;

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-bold transition focus-ring",
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? "w-full" : "w-auto",
        isDisabled && "pointer-events-none opacity-55",
        className,
      )}>
      {loading ? (
        <Loader2 className="animate-spin" size={iconSize} />
      ) : (
        <>
          {Icon ? <Icon size={iconSize} /> : null}
          {title ? <span>{title}</span> : null}
          {children}
        </>
      )}
    </button>
  );
}
