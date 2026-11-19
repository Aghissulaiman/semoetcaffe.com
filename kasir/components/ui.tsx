"use client";

import { Loader2, X } from "lucide-react";
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-dark",
  secondary: "bg-primary-soft text-primary hover:bg-cream",
  outline:
    "border border-line bg-surface text-ink hover:border-primary/40 hover:bg-primary-soft",
  ghost: "text-ink-soft hover:bg-primary-soft",
  danger: "bg-danger text-white hover:bg-danger/90",
  success: "bg-success text-white hover:bg-success/90",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
  icon: "h-10 w-10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export type BadgeTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brown";

const BADGE_TONES: Record<BadgeTone, string> = {
  default: "bg-primary-soft text-ink-soft",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brown: "bg-cream text-primary-dark",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold leading-none",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
const MODAL_SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof MODAL_SIZES;
  bodyClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  bodyClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="animate-fade-in absolute inset-0 bg-espresso/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        className={cn(
          "animate-slide-up relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl",
          MODAL_SIZES[size],
        )}
      >
        {title || subtitle ? (
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              {title ? (
                <h2 className="text-base font-extrabold text-ink">{title}</h2>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="focus-ring -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-primary-soft hover:text-ink"
            >
              <X size={18} />
            </button>
          </header>
        ) : null}

        <div
          className={cn(
            "thin-scroll flex-1 overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer className="border-t border-line bg-milk px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-bold text-ink-soft">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

const FIELD_CLASS =
  "w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-milk";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASS, "h-11", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD_CLASS, "h-11 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(FIELD_CLASS, "min-h-[80px] resize-y py-2.5", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Page header / stat / empty / loader
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="no-print flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brown",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "brown" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass: Record<string, string> = {
    brown: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(42,26,17,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl",
              toneClass[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xl font-black tracking-tight text-ink tabular">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-milk/60 px-6 py-12 text-center">
      {icon ? (
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-extrabold text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageLoader({ label = "Memuat data kasir…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}

/** Segmented control sederhana untuk filter. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-primary-soft p-1",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "focus-ring flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition",
            option.value === value
              ? "bg-surface text-primary shadow-sm"
              : "text-ink-soft hover:text-primary",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
