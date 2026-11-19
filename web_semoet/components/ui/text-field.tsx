"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface BaseProps {
  label: string;
  error?: string | null;
  icon?: LucideIcon;
  hint?: string;
  multiline?: boolean;
}

type InputProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    multiline: true;
    rows?: number;
  };

type TextFieldProps = InputProps | TextareaProps;

/** Input berlabel dengan state error bertema kopi. */
export function TextField(props: TextFieldProps) {
  const { label, error, icon: Icon, hint } = props;
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(Boolean("type" in props && props.type === "password"));

  const multiline = props.multiline === true;
  const rows = "rows" in props ? props.rows : undefined;
  const inputType = "type" in props ? props.type : undefined;

  // Prop khusus komponen tidak boleh ikut tersebar ke elemen DOM: React akan
  // memperingatkan atribut non-boolean seperti `multiline` pada <textarea>.
  const domProps = { ...props } as Record<string, unknown>;
  delete domProps.label;
  delete domProps.error;
  delete domProps.icon;
  delete domProps.hint;
  delete domProps.multiline;
  delete domProps.rows;
  delete domProps.type;

  const common = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    className: cn(
      "w-full bg-transparent py-3 text-[15px] text-ink outline-none placeholder:text-muted/80 disabled:opacity-60",
      multiline && "resize-y leading-relaxed",
    ),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-[14px] border-[1.5px] bg-surface px-3.5 transition",
          error ? "border-danger" : focused ? "border-primary" : "border-line",
          multiline && "items-start",
        )}>
        {Icon ? <Icon size={18} className="mt-3 shrink-0 text-ink-soft" /> : null}
        {multiline ? (
          <textarea
            {...(domProps as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            rows={rows ?? 3}
            {...common}
          />
        ) : (
          <input
            {...(domProps as unknown as InputHTMLAttributes<HTMLInputElement>)}
            type={hidden ? "password" : inputType}
            {...common}
          />
        )}
        {inputType === "password" ? (
          <button
            type="button"
            onClick={() => setHidden((value) => !value)}
            className="shrink-0 text-xs font-semibold text-ink-soft"
            aria-label={hidden ? "Tampilkan password" : "Sembunyikan password"}>
            {hidden ? "Lihat" : "Sembunyi"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}
