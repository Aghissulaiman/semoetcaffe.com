"use client";

import {
  Clock3,
  DoorOpen,
  Globe2,
  History,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Save,
  Store,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  PageLoader,
  StatCard,
} from "@/components/ui";
import {
  api,
  apiErrorFrom,
  type ApiShift,
  type ApiStoreMode,
  type ApiStoreStatus,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatDateTime,
  formatDuration,
  formatTime,
} from "@/lib/format";
import { useKasir } from "@/lib/store";

function timeInZone(
  iso: string | null,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone, ...options }).format(date);
}

function nextChangeLabel(store: ApiStoreStatus): string {
  const iso = store.isOpen ? store.nextCloseAt : store.nextOpenAt;
  if (!iso) return "Tidak ada jadwal";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Tidak ada jadwal";

  const now = new Date();
  const sameDay =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: store.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) ===
    new Intl.DateTimeFormat("en-CA", {
      timeZone: store.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

  const day = sameDay
    ? "Hari ini"
    : timeInZone(iso, store.timezone, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
  const time = timeInZone(iso, store.timezone, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

export default function TokoPage() {
  const { hydrated, branchId, branch } = useKasir();
  const [store, setStore] = useState<ApiStoreStatus | null>(null);
  const [opensAt, setOpensAt] = useState("09:00");
  const [closesAt, setClosesAt] = useState("22:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ApiStoreMode | "schedule" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shift, setShift] = useState<ApiShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const loadedBranchRef = useRef<string | null>(null);

  const visibleStore = store && store.branchId === branchId ? store : null;
  const visibleShift =
    shift && branchId && shift.branchId === branchId ? shift : null;

  useEffect(() => {
    if (!hydrated || !branchId) return;
    let cancelled = false;

    async function fetchStore(silent: boolean) {
      if (!silent) setLoading(true);
      try {
        const data = await api<ApiStoreStatus>("/admin/store", {
          query: { branchId },
        });
        if (cancelled) return;
        setStore(data);
        setError(null);
        // Isi form hanya saat cabang pertama kali dimuat supaya polling
        // setiap 30 detik tidak menimpa jam yang sedang diedit.
        if (loadedBranchRef.current !== branchId) {
          loadedBranchRef.current = branchId;
          setOpensAt(data.schedule.opensAt);
          setClosesAt(data.schedule.closesAt);
        }
      } catch (err) {
        if (!cancelled && !silent) {
          setError(apiErrorFrom(err, "Gagal memuat status toko"));
        }
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    void fetchStore(false);
    const timer = window.setInterval(() => void fetchStore(true), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated, branchId, refreshKey]);

  useEffect(() => {
    if (!hydrated || !branchId) return;
    let cancelled = false;

    async function fetchShift(silent: boolean) {
      if (!silent) setShiftLoading(true);
      try {
        const data = await api<{ shift: ApiShift | null }>(
          "/admin/shifts/active",
          { query: { branchId } },
        );
        if (cancelled) return;
        setShift(data.shift);
        setShiftError(null);
      } catch (err) {
        if (!cancelled && !silent) {
          setShiftError(apiErrorFrom(err, "Gagal memuat shift aktif"));
        }
      } finally {
        if (!cancelled && !silent) setShiftLoading(false);
      }
    }

    void fetchShift(false);
    const timer = window.setInterval(() => void fetchShift(true), 60_000);
    const handleChanged = () => void fetchShift(true);
    window.addEventListener("semoet:shift-changed", handleChanged);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("semoet:shift-changed", handleChanged);
    };
  }, [hydrated, branchId, refreshKey]);

  function openShiftModal() {
    window.dispatchEvent(new Event("semoet:open-shift"));
  }

  async function changeMode(mode: ApiStoreMode) {
    if (!branchId || saving) return;
    setSaving(mode);
    setError(null);
    setSuccess(null);
    try {
      const data = await api<ApiStoreStatus>("/admin/store/status", {
        method: "PATCH",
        body: { branchId, mode },
      });
      setStore(data);
      setSuccess(
        mode === "auto"
          ? "Toko kembali mengikuti jadwal otomatis."
          : mode === "open"
            ? "Toko berhasil dibuka."
            : "Toko berhasil ditutup.",
      );
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal mengubah status toko"));
    } finally {
      setSaving(null);
    }
  }

  async function saveSchedule() {
    if (!branchId || saving || !opensAt || !closesAt) return;
    setSaving("schedule");
    setError(null);
    setSuccess(null);
    try {
      const data = await api<ApiStoreStatus>("/admin/store/schedule", {
        method: "PUT",
        body: { branchId, opensAt, closesAt },
      });
      setStore(data);
      setSuccess("Jadwal buka/tutup otomatis berhasil disimpan.");
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal menyimpan jadwal toko"));
    } finally {
      setSaving(null);
    }
  }

  if (!hydrated || (loading && !visibleStore)) {
    return <PageLoader label="Memuat status toko…" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Toko"
        description="Buka atau tutup toko, dan atur jam operasional otomatis setiap hari."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading || !branchId}
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : undefined}
            />
            Muat ulang
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success-soft px-3 py-2 text-xs font-semibold text-success">
          <Store size={15} className="mt-0.5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="Tutup notifikasi"
            className="focus-ring -mr-1 -mt-0.5 flex h-6 w-6 items-center justify-center rounded-md hover:bg-success/10"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}

      {!visibleStore ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-sm font-bold text-ink">Status toko belum tersedia</p>
          <p className="mt-1 text-xs text-muted">
            Pilih cabang lalu muat ulang halaman ini.
          </p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "overflow-hidden rounded-2xl border shadow-[0_2px_20px_rgba(42,26,17,0.05)]",
              visibleStore.isOpen
                ? "border-success/30 bg-success-soft/60"
                : "border-danger/25 bg-danger-soft/50",
            )}
          >
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={visibleStore.isOpen ? "success" : "danger"}>
                    {visibleStore.isOpen ? "Toko buka" : "Toko tutup"}
                  </Badge>
                  <Badge tone={visibleStore.mode === "auto" ? "info" : "brown"}>
                    {visibleStore.mode === "auto"
                      ? "Otomatis"
                      : "Manual"}
                  </Badge>
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-ink">
                  {visibleStore.isOpen
                    ? "Toko sedang menerima pesanan"
                    : "Toko sedang tutup"}
                </h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-soft">
                  {visibleStore.mode === "auto"
                    ? `Mengikuti jadwal otomatis ${visibleStore.schedule.opensAt}–${visibleStore.schedule.closesAt} (${visibleStore.timezone}).`
                    : "Status diatur manual. Aktifkan jadwal otomatis agar toko buka/tutup sendiri sesuai jam."}
                </p>
                <p className="mt-2 text-xs font-semibold text-ink-soft">
                  {visibleStore.mode === "auto" ? (
                    <>
                      {visibleStore.isOpen ? "Tutup berikutnya" : "Buka berikutnya"}
                      :{" "}
                      <span className="font-black text-ink">
                        {nextChangeLabel(visibleStore)}
                      </span>
                    </>
                  ) : (
                    <>
                      Mode manual aktif. Jadwal otomatis berikutnya:{" "}
                      <span className="font-black text-ink">
                        {nextChangeLabel(visibleStore)}
                      </span>{" "}
                      (baru berlaku setelah mode otomatis diaktifkan).
                    </>
                  )}
                </p>
              </div>
              <span
                className={cn(
                  "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
                  visibleStore.isOpen
                    ? "bg-success text-white"
                    : "bg-danger text-white",
                )}
              >
                {visibleStore.isOpen ? (
                  <DoorOpen size={30} />
                ) : (
                  <Power size={30} />
                )}
              </span>
            </div>

            <div className="flex flex-col gap-2 border-t border-line/70 bg-surface/60 px-5 py-3 sm:flex-row">
              {visibleStore.isOpen ? (
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => void changeMode("closed")}
                  disabled={saving !== null}
                >
                  {saving === "closed" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Power size={16} />
                  )}
                  Tutup toko sekarang
                </Button>
              ) : (
                <Button
                  variant="success"
                  className="flex-1"
                  onClick={() => void changeMode("open")}
                  disabled={saving !== null}
                >
                  {saving === "open" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <DoorOpen size={16} />
                  )}
                  Buka toko sekarang
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => void changeMode("auto")}
                disabled={saving !== null || visibleStore.mode === "auto"}
              >
                {saving === "auto" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Clock3 size={16} />
                )}
                Ikuti jadwal otomatis
              </Button>
            </div>
          </div>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-ink">Shift kasir</h3>
                  <Badge tone={visibleShift ? "success" : "default"}>
                    {visibleShift ? "Aktif" : "Belum dibuka"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Isi jam mulai dan selesai rencana saat membuka atau mengganti
                  shift.
                </p>
              </div>
              <Button
                variant={visibleShift ? "outline" : "primary"}
                size="sm"
                onClick={openShiftModal}
                disabled={!branchId}
              >
                {visibleShift ? <Clock3 size={14} /> : <Play size={14} />}
                {visibleShift ? "Atur shift" : "Buka shift"}
              </Button>
            </div>

            {shiftError ? (
              <p className="mt-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                {shiftError}
              </p>
            ) : shiftLoading && !visibleShift ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-milk/60 px-3 py-2 text-xs font-semibold text-muted">
                <Loader2 size={14} className="animate-spin text-primary" />
                Memuat shift aktif…
              </div>
            ) : visibleShift ? (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-milk/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Petugas
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-ink">
                    {visibleShift.staffName}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {visibleShift.staffEmail ?? "Akun staf"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-milk/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Rencana
                  </p>
                  <p className="mt-1 text-sm font-black text-ink tabular">
                    {visibleShift.plannedStartAt &&
                    visibleShift.plannedEndAt
                      ? `${formatTime(visibleShift.plannedStartAt)} – ${formatTime(
                          visibleShift.plannedEndAt,
                        )}`
                      : "Belum diatur"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {visibleShift.plannedDurationMinutes !== null
                      ? `Durasi ${formatDuration(
                          visibleShift.plannedDurationMinutes,
                        )}`
                      : "Atur lewat tombol di atas"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-milk/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Aktual
                  </p>
                  <p className="mt-1 text-sm font-black text-ink tabular">
                    {formatTime(visibleShift.openedAt)}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    Dibuka oleh {visibleShift.openedByName ?? "-"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-line bg-milk/50 px-3 py-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                <div>
                  <p className="text-sm font-extrabold text-ink">
                    Belum ada shift aktif
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Buka shift dan isi jam rencananya agar operasional tercatat.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={openShiftModal}
                  disabled={!branchId}
                >
                  <Play size={14} />
                  Buka shift
                </Button>
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-ink">
                    Jadwal otomatis
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Berlaku setiap hari untuk cabang ini.
                  </p>
                </div>
                <Badge
                  tone={
                    visibleStore.mode === "auto" ? "success" : "default"
                  }
                >
                  {visibleStore.mode === "auto" ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>

              {!visibleStore.schedule.isConfigured ? (
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                  Jadwal belum diatur. Simpan jam di bawah untuk membuat jadwal
                  otomatis.
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <Field label="Jam buka" required>
                  <Input
                    type="time"
                    value={opensAt}
                    onChange={(event) => setOpensAt(event.target.value)}
                    className="text-sm font-bold tabular"
                  />
                </Field>
                <Field label="Jam tutup" required>
                  <Input
                    type="time"
                    value={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                    className="text-sm font-bold tabular"
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Jika jam tutup lebih kecil dari jam buka, jadwal dianggap
                melewati tengah malam. Contoh: buka 18.00, tutup 02.00.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => void saveSchedule()}
                  disabled={
                    saving !== null || !opensAt || !closesAt
                  }
                >
                  {saving === "schedule" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Simpan jadwal
                </Button>
                {visibleStore.mode !== "auto" ? (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => void changeMode("auto")}
                    disabled={saving !== null}
                  >
                    <Clock3 size={16} />
                    Aktifkan otomatis
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <StatCard
                label="Zona waktu"
                value={visibleStore.timezone}
                hint={visibleStore.branchName || branch?.name}
                icon={<Globe2 size={15} />}
                tone="info"
              />
              <StatCard
                label="Terakhir diubah"
                value={visibleStore.updatedByName ?? "-"}
                hint={formatDateTime(visibleStore.updatedAt)}
                icon={<History size={15} />}
              />
              <div className="rounded-2xl border border-line bg-milk/70 p-3.5">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  Cara kerja
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Mode otomatis menghitung status toko dari jam di atas. Buka
                  atau tutup manual akan menimpa jadwal sampai kamu memilih
                  “Ikuti jadwal otomatis” lagi.
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
