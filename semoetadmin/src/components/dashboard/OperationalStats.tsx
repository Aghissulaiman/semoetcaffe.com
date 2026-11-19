import { Skeleton } from "@/components/common/DataState";
import {
  BoxCubeIcon,
  CalenderIcon,
  ChatIcon,
  PaperPlaneIcon,
  ShootingStarIcon,
  UserCircleIcon,
} from "@/icons";
import type { DashboardOverview } from "@/types/api";
import { cn } from "@/utils";
import React from "react";

type StatTone = "coffee" | "gold" | "success" | "warning" | "danger";

const toneClasses: Record<StatTone, string> = {
  coffee: "bg-coffee-brown/10 text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel",
  gold: "bg-coffee-gold/15 text-coffee-gold",
  success: "bg-coffee-success/15 text-coffee-success",
  warning: "bg-coffee-warning/15 text-coffee-warning",
  danger: "bg-coffee-danger/15 text-coffee-danger",
};

interface OperationalStatsProps {
  data?: DashboardOverview;
  loading?: boolean;
}

interface StatItem {
  label: string;
  hint: string;
  value: number;
  icon: React.ReactNode;
  tone: StatTone;
  /** Tandai bila perlu perhatian (nilai > 0). */
  alertWhenPositive?: boolean;
}

export default function OperationalStats({ data, loading }: OperationalStatsProps) {
  const items: StatItem[] = [
    {
      label: "Reservasi Aktif",
      hint: "Reservasi berjalan",
      value: data?.reservations.activeReservations ?? 0,
      icon: <CalenderIcon />,
      tone: "success",
    },
    {
      label: "Booking Event",
      hint: "Menunggu konfirmasi",
      value: data?.events.pendingEventBookings ?? 0,
      icon: <PaperPlaneIcon />,
      tone: "gold",
      alertWhenPositive: true,
    },
    {
      label: "Pengguna Baru",
      hint: "Daftar hari ini",
      value: data?.users.newUsersToday ?? 0,
      icon: <UserCircleIcon />,
      tone: "coffee",
    },
    {
      label: "Stok Menipis",
      hint: "Bahan perlu restock",
      value: data?.inventory.lowStockIngredients ?? 0,
      icon: <BoxCubeIcon />,
      tone: "danger",
      alertWhenPositive: true,
    },
    {
      label: "Chat Belum Ditangani",
      hint: "Menunggu dibalas",
      value: data?.support.unassignedConversations ?? 0,
      icon: <ChatIcon />,
      tone: "warning",
      alertWhenPositive: true,
    },
    {
      label: "Moment Menunggu",
      hint: "Perlu moderasi",
      value: data?.moderation.pendingMoments ?? 0,
      icon: <ShootingStarIcon />,
      tone: "warning",
      alertWhenPositive: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => {
        const needsAttention = Boolean(item.alertWhenPositive) && !loading && item.value > 0;
        return (
          <div
            key={item.label}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-white p-4 transition-colors dark:bg-coffee-night-soft",
              needsAttention
                ? "border-coffee-warning/40 bg-coffee-warning/5 dark:border-coffee-warning/30"
                : "border-coffee-linen dark:border-coffee-night-border",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5",
                toneClasses[item.tone],
              )}
            >
              {item.icon}
            </span>
            {loading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <p className="text-xl font-bold text-coffee-espresso dark:text-coffee-cream">
                {item.value}
              </p>
            )}
            <div>
              <p className="text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/80">
                {item.label}
              </p>
              <p className="text-theme-xs text-coffee-muted">{item.hint}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
