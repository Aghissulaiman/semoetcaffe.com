import { cn } from "@/utils";
import React from "react";

type Tone = "coffee" | "gold" | "success" | "danger" | "warning" | "muted";

const toneClasses: Record<Tone, string> = {
  coffee: "bg-coffee-brown/10 text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel",
  gold: "bg-coffee-gold/15 text-coffee-gold dark:bg-coffee-gold/15 dark:text-coffee-gold",
  success: "bg-coffee-success/12 text-coffee-success dark:bg-coffee-success/20",
  danger: "bg-coffee-danger/12 text-coffee-danger dark:bg-coffee-danger/20",
  warning: "bg-coffee-warning/15 text-coffee-warning dark:bg-coffee-warning/20",
  muted: "bg-coffee-linen/60 text-coffee-muted dark:bg-white/5",
};

interface KpiDelta {
  /** Persentase perubahan vs periode pembanding; null bila belum ada pembanding. */
  pct: number | null;
  /** Bila true, kenaikan dianggap buruk (mis. diskon atau pembatalan naik). */
  invert?: boolean;
  /** Label pembanding, default "vs periode lalu". */
  compareLabel?: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: KpiDelta;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = "coffee",
  delta,
}) => {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 shadow-theme-xs transition-shadow hover:shadow-theme-sm dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-theme-sm font-medium text-coffee-muted">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5",
              toneClasses[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-coffee-espresso dark:text-coffee-cream">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-theme-xs text-coffee-muted">{hint}</p>}
      {delta && <KpiDeltaLine delta={delta} />}
    </div>
  );
};

function KpiDeltaLine({ delta }: { delta: KpiDelta }) {
  const { pct, invert = false, compareLabel = "vs periode lalu" } = delta;

  if (pct === null) {
    return (
      <p className="mt-2 text-theme-xs text-coffee-muted">
        <span className="me-1 font-medium">Belum ada pembanding</span>
      </p>
    );
  }

  const up = pct > 0;
  const flat = pct === 0;
  const good = flat ? null : up !== invert;
  const toneClass = flat
    ? "text-coffee-muted"
    : good
      ? "text-coffee-success"
      : "text-coffee-danger";

  return (
    <p className={cn("mt-2 flex items-center gap-1 text-theme-xs font-semibold", toneClass)}>
      <span aria-hidden>{flat ? "■" : up ? "▲" : "▼"}</span>
      <span>
        {flat ? "0" : `${up ? "+" : "-"}${Math.abs(pct)}%`}
      </span>
      <span className="font-normal text-coffee-muted">{compareLabel}</span>
    </p>
  );
}

export default KpiCard;
