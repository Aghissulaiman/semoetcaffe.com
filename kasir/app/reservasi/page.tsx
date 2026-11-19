"use client";

import {
  Banknote,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Phone,
  Search,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ReservationFormModal } from "@/components/reservation-form-modal";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  StatCard,
} from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import {
  formatDateLong,
  formatRupiah,
  relativeDayLabel,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
} from "@/lib/format";
import { useKasir } from "@/lib/store";
import type { Reservation, ReservationStatus } from "@/lib/types";
import { useToday } from "@/lib/use-today";

type Tab = "today" | "upcoming" | "all" | "history";

const HISTORY_STATUSES: ReservationStatus[] = [
  "completed",
  "cancelled",
  "no_show",
];

export default function ReservasiPage() {
  const { hydrated, reservations, addReservation, updateReservation } =
    useKasir();
  const [tab, setTab] = useState<Tab>("today");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useToday();
  const todayReservations = reservations.filter(
    (reservation) => reservation.date === today,
  );
  const pendingCount = reservations.filter(
    (reservation) => reservation.status === "requested",
  ).length;
  const confirmedToday = todayReservations.filter(
    (reservation) => reservation.status === "confirmed",
  ).length;
  const guestsToday = todayReservations
    .filter(
      (reservation) =>
        reservation.status !== "cancelled" && reservation.status !== "no_show",
    )
    .reduce((sum, reservation) => sum + reservation.guests, 0);

  const filtered = useMemo(() => {
    if (!today) return [];
    const query = search.trim().toLowerCase();
    const list = reservations.filter((reservation) => {
      let matchTab = true;
      if (tab === "today") matchTab = reservation.date === today;
      else if (tab === "upcoming") {
        matchTab =
          reservation.date > today &&
          !HISTORY_STATUSES.includes(reservation.status);
      } else if (tab === "history") {
        matchTab = HISTORY_STATUSES.includes(reservation.status);
      }

      const matchSearch =
        !query ||
        reservation.name.toLowerCase().includes(query) ||
        reservation.phone.includes(query) ||
        reservation.code.toLowerCase().includes(query) ||
        reservation.area.toLowerCase().includes(query);

      return matchTab && matchSearch;
    });

    return list.sort((a, b) => {
      const left = `${a.date} ${a.time}`;
      const right = `${b.date} ${b.time}`;
      return tab === "history"
        ? right.localeCompare(left)
        : left.localeCompare(right);
    });
  }, [reservations, tab, search, today]);

  async function setStatus(id: string, status: ReservationStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateReservation(id, { status });
      if (selected?.id === id) setSelected({ ...selected, status });
    } catch (err) {
      setError(apiErrorFrom(err, "Status reservasi gagal diubah"));
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !today) return <PageLoader label="Memuat reservasi…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reservasi"
        description="Terima booking meja, konfirmasi kedatangan, dan kelola reservasi tamu."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <CalendarPlus size={16} />
            Buat Reservasi
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Reservasi Hari Ini"
          value={todayReservations.length}
          hint={formatDateLong(today)}
          icon={<CalendarDays size={15} />}
        />
        <StatCard
          label="Menunggu Konfirmasi"
          value={pendingCount}
          hint="Termasuk reservasi mendatang"
          icon={<Clock size={15} />}
          tone="warning"
        />
        <StatCard
          label="Terkonfirmasi Hari Ini"
          value={confirmedToday}
          hint="Siap menyambut tamu"
          icon={<CheckCircle2 size={15} />}
          tone="success"
        />
        <StatCard
          label="Total Tamu Hari Ini"
          value={guestsToday}
          hint="Perkiraan jumlah kursi"
          icon={<Users size={15} />}
          tone="info"
        />
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "today", label: "Hari Ini" },
            { value: "upcoming", label: "Akan Datang" },
            { value: "all", label: "Semua" },
            { value: "history", label: "Riwayat" },
          ]}
        />
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama / telepon / kode…"
            className="h-10 pl-9 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="Belum ada reservasi"
          description="Reservasi baru yang dicatat kasir akan muncul di sini."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <CalendarPlus size={14} />
              Buat Reservasi
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((reservation) => {
            const isHistory = HISTORY_STATUSES.includes(reservation.status);
            return (
              <article
                key={reservation.id}
                className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(42,26,17,0.04)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-primary-soft px-1 py-2 text-center">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-muted">
                      {relativeDayLabel(reservation.date)}
                    </span>
                    <span className="text-base font-black text-primary tabular">
                      {reservation.time}
                    </span>
                    <span className="text-[9px] font-semibold text-muted">
                      {reservation.durationMinutes}m
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-ink">
                        {reservation.name}
                      </p>
                      <Badge tone={RESERVATION_STATUS_TONE[reservation.status]}>
                        {RESERVATION_STATUS_LABEL[reservation.status]}
                      </Badge>
                    </div>
                    <p className="font-mono text-[10px] text-muted">
                      {reservation.code}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                      <span className="flex items-center gap-1">
                        <Phone size={12} className="text-muted" />
                        {reservation.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} className="text-muted" />
                        {reservation.guests} tamu
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} className="text-muted" />
                        {reservation.area}
                        {reservation.tableNumber
                          ? ` · ${reservation.tableNumber}`
                          : ""}
                      </span>
                    </div>
                    {reservation.depositAmount > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge
                          tone={reservation.depositPaid ? "success" : "warning"}
                        >
                          <Banknote size={11} />
                          DP {formatRupiah(reservation.depositAmount)} ·{" "}
                          {reservation.depositPaid ? "Lunas" : "Belum"}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                </div>

                {reservation.note ? (
                  <p className="mt-2 rounded-lg bg-milk px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
                    {reservation.note}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(reservation)}
                  >
                    Detail
                  </Button>

                  {reservation.status === "requested" ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void setStatus(reservation.id, "confirmed")}
                    >
                      <CheckCircle2 size={14} />
                      Konfirmasi
                    </Button>
                  ) : null}

                  {reservation.status === "confirmed" ? (
                    <Button
                      variant="success"
                      size="sm"
                      disabled={busy}
                      onClick={() => void setStatus(reservation.id, "seated")}
                    >
                      <UserCheck size={14} />
                      Tandai Duduk
                    </Button>
                  ) : null}

                  {reservation.status === "seated" ? (
                    <Button
                      variant="success"
                      size="sm"
                      disabled={busy}
                      onClick={() => void setStatus(reservation.id, "completed")}
                    >
                      <CheckCircle2 size={14} />
                      Selesai
                    </Button>
                  ) : null}

                  {!isHistory ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => setCancelTarget(reservation)}
                    >
                      <XCircle size={14} />
                      Batalkan
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ReservationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={async (input) => {
          await addReservation(input);
          setTab(input.date === today ? "today" : "upcoming");
        }}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.code ?? "Detail Reservasi"}
        subtitle={
          selected
            ? `${selected.name} · ${relativeDayLabel(selected.date)} ${selected.time}`
            : undefined
        }
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSelected(null)}>
              Tutup
            </Button>
          </div>
        }
      >
        {selected ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-milk p-3">
              <Info label="Nama tamu" value={selected.name} />
              <Info label="No. WhatsApp" value={selected.phone} />
              <Info label="Tanggal" value={formatDateLong(selected.date)} />
              <Info
                label="Jam"
                value={`${selected.time} (${selected.durationMinutes} menit)`}
              />
              <Info label="Jumlah tamu" value={`${selected.guests} orang`} />
              <Info label="Area" value={selected.area} />
              <Info
                label="Meja"
                value={selected.tableNumber ?? "Belum ditentukan"}
              />
              <Info
                label="Status"
                value={RESERVATION_STATUS_LABEL[selected.status]}
              />
              <Info
                label="DP"
                value={
                  selected.depositAmount > 0
                    ? `${formatRupiah(selected.depositAmount)} · ${
                        selected.depositPaid ? "Lunas" : "Belum dibayar"
                      }`
                    : "Tanpa DP"
                }
              />
              <Info
                label="Estimasi total"
                value={
                  selected.totalEstimate > 0
                    ? formatRupiah(selected.totalEstimate)
                    : "-"
                }
              />
            </div>
            <div>
              <p className="text-xs font-bold text-muted">Catatan</p>
              <p className="mt-1 rounded-xl border border-line px-3 py-2 text-xs leading-relaxed text-ink-soft">
                {selected.note ?? "Tidak ada catatan."}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Batalkan reservasi?"
        subtitle={cancelTarget?.code}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Kembali
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (cancelTarget) {
                  await setStatus(cancelTarget.id, "cancelled");
                }
                setCancelTarget(null);
              }}
            >
              Ya, batalkan
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Reservasi akan ditandai <strong>dibatalkan</strong>. Tindakan ini tidak
          bisa dikembalikan dari aplikasi kasir.
        </p>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-bold text-ink">{value}</p>
    </div>
  );
}
