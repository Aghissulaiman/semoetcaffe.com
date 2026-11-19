"use client";

/**
 * Buat Reservasi — form booking RUANGAN (area) & event.
 *
 * Alur: pilih cabang → jumlah orang → tanggal → pilih JAM MULAI & JAM SELESAI
 * (rentang, bukan durasi tetap) → pilih satu/lebih ruangan bergambar → detail
 * acara & menu → setujui ketentuan DP → kirim ke POST /reservations.
 *
 * Total sewa = Σ(harga per jam ruangan × jumlah jam); DP otomatis dari total:
 * DP1 30% (dijepit Rp300.000–500.000), DP2 30% dari sisa, sisanya pelunasan.
 * Field yang belum punya kolom sendiri (nama/no telp, event, menu) digabung ke
 * `specialRequests`. Menu dipilih di layar penuh `/reservasi/menu`.
 */
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Home,
  Image as ImageIcon,
  Leaf,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  PieChart,
  ShieldCheck,
  Sparkles,
  Square,
  User,
  Utensils,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ImageChoiceCard } from "@/components/image-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ScreenHeader } from "@/components/ui/screen-header";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import {
  areaTypeLabel,
  computeDepositStages,
  DEPOSIT_TERMS,
  describeDeposit1,
  formatRupiah,
} from "@/lib/format";
import { ApiError, apiErrorFrom } from "@/services/client";
import { listBranches, listBranchAreas } from "@/services/branch.service";
import {
  checkAvailability,
  createReservation,
  createReservationDepositCharge,
} from "@/services/reservation.service";
import { useAuthStore } from "@/store/auth-store";
import {
  menuPickLabel,
  menuPicksTotal,
  useReservationDraftStore,
} from "@/store/reservation-draft-store";

import type { AvailabilityResponse, Branch, DiningArea } from "@/types/api";

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function wibDateLabel(date: string): { day: string; weekday: string } {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  return {
    day: parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }),
    weekday: parsed.toLocaleDateString("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }),
  };
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Geser tanggal 'YYYY-MM-DD' sebanyak n hari. */
function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  parsed.setDate(parsed.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed);
}

/** Subjudul kartu area: tipe area + harga sewa per jam. */
function areaSubtitle(area: DiningArea): string | undefined {
  const parts: string[] = [];
  const type = areaTypeLabel(area.areaType);
  if (type) parts.push(type);
  if (area.pricePerHourIdr != null) parts.push(`${formatRupiah(area.pricePerHourIdr)}/jam`);
  else if (area.totalCapacity > 0) parts.push(`${area.totalCapacity} kursi`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Ikon fallback kartu area sesuai tipe tempat duduk. */
function areaIcon(type: string | null) {
  switch (type) {
    case "indoor":
      return Home;
    case "outdoor":
      return Leaf;
    case "private_room":
      return Lock;
    default:
      return ImageIcon;
  }
}

/** Daftar 30 hari ke depan mulai hari ini. */
function upcomingDates(count = 30): string[] {
  const start = todayWib();
  return Array.from({ length: count }, (_, index) => shiftDate(start, index));
}

/** Jam (menit) dari sebuah ISO menurut WIB; -1 bila tidak valid. */
function wibMinutesOf(iso: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return -1;
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
  const [hour, minute] = parts.split(":").map((value) => Number(value));
  return hour * 60 + minute;
}

/**
 * Draf isian form disimpan di sessionStorage supaya tidak hilang saat
 * pelanggan membuka layar pilih menu lalu kembali ke form (navigasi web
 * me-unmount halaman, berbeda dengan stack navigator di mobile).
 */
const FORM_DRAFT_KEY = "semoet.reservationFormDraft";

interface FormDraft {
  branchId: string | null;
  guestCount: number;
  date: string;
  roomIds: string[];
  startTime: string | null;
  endTime: string | null;
  contactName: string;
  contactPhone: string;
  eventName: string;
  orderNote: string;
  notes: string;
}

export default function NewReservationPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [areas, setAreas] = useState<DiningArea[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [branchId, setBranchId] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [date, setDate] = useState<string>(todayWib());
  /** Ruangan (area) terpilih; reservasi per-ruangan, bisa lebih dari satu. */
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Nama & no telp terisi otomatis dari akun yang sedang login.
  const [contactName, setContactName] = useState(() => user?.displayName ?? "");
  const [contactPhone, setContactPhone] = useState(() => user?.phoneE164 ?? "");
  const [eventName, setEventName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [notes, setNotes] = useState("");

  // Menu dibagi lewat store agar layar pilih menu bisa satu layar penuh.
  const menuPicks = useReservationDraftStore((state) => state.menuPicks);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agreeDeposit, setAgreeDeposit] = useState(false);

  const dates = useMemo(() => upcomingDates(), []);

  /** Draf form sudah dipulihkan dari sessionStorage (cegah timpa saat mount). */
  const [draftReady, setDraftReady] = useState(false);

  // Pulihkan isian form setelah kembali dari layar pilih menu.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FORM_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormDraft>;
        if (typeof draft.branchId === "string") setBranchId(draft.branchId);
        if (typeof draft.guestCount === "number") setGuestCount(draft.guestCount);
        if (typeof draft.date === "string" && dates.includes(draft.date)) setDate(draft.date);
        if (Array.isArray(draft.roomIds)) setRoomIds(draft.roomIds.filter((id) => typeof id === "string"));
        if (typeof draft.startTime === "string") setStartTime(draft.startTime);
        if (typeof draft.endTime === "string") setEndTime(draft.endTime);
        if (typeof draft.contactName === "string") setContactName(draft.contactName);
        if (typeof draft.contactPhone === "string") setContactPhone(draft.contactPhone);
        if (typeof draft.eventName === "string") setEventName(draft.eventName);
        if (typeof draft.orderNote === "string") setOrderNote(draft.orderNote);
        if (typeof draft.notes === "string") setNotes(draft.notes);
      }
    } catch {
      // Draf rusak / storage diblokir — mulai dari form kosong.
    } finally {
      setDraftReady(true);
    }
  }, [dates]);

  // Simpan isian form setiap berubah.
  useEffect(() => {
    if (!draftReady) return;
    const draft: FormDraft = {
      branchId,
      guestCount,
      date,
      roomIds,
      startTime,
      endTime,
      contactName,
      contactPhone,
      eventName,
      orderNote,
      notes,
    };
    try {
      sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage penuh/diblokir — abaikan, form tetap bisa dipakai.
    }
  }, [
    draftReady,
    branchId,
    guestCount,
    date,
    roomIds,
    startTime,
    endTime,
    contactName,
    contactPhone,
    eventName,
    orderNote,
    notes,
  ]);

  // Guard login.
  useEffect(() => {
    if (status === "guest") router.replace("/auth/login");
  }, [status, router]);

  // Isi otomatis kontak setelah sesi login selesai dihidrasi.
  useEffect(() => {
    if (!user) return;
    setContactName((prev) => prev || user.displayName);
    setContactPhone((prev) => prev || user.phoneE164 || "");
  }, [user]);

  const loadBranches = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);
    try {
      const list = await listBranches({ limit: 20 });
      setBranches(list);
      setBranchId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setBootstrapError(apiErrorFrom(err, "Gagal memuat daftar cabang"));
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  // Area (ruangan) mengikuti cabang terpilih.
  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    listBranchAreas(branchId)
      .then((areaList) => {
        if (!alive) return;
        setAreas(areaList);
        // Buang ruangan terpilih yang bukan bagian dari cabang ini.
        setRoomIds((prev) => prev.filter((id) => areaList.some((area) => area.id === id)));
      })
      .catch(() => {
        if (alive) setAreas([]);
      });
    return () => {
      alive = false;
    };
  }, [branchId]);

  const loadAvailability = useCallback(async () => {
    if (!branchId) return;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const result = await checkAvailability({
        branchId,
        date,
        guestCount,
        areaId: roomIds[0],
      });
      setAvailability(result);
      const day = result.dates.find((item) => item.date === date);
      const now = Date.now();
      setLoadedAt(now);
      // Buang jam terpilih bila slot-nya sudah tidak tersedia/hilang.
      const validStarts = day?.freeSlots.map((slot) => slot.startTime) ?? [];
      setStartTime((prev) => (prev && validStarts.includes(prev) ? prev : null));
      setEndTime((prev) => (prev && validStarts.includes(prev) ? prev : null));
    } catch (err) {
      setAvailability(null);
      setAvailabilityError(apiErrorFrom(err, "Gagal memeriksa ketersediaan"));
    } finally {
      setAvailabilityLoading(false);
    }
  }, [branchId, date, guestCount, roomIds]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const selectedDay = availability?.dates.find((item) => item.date === date) ?? null;
  const slots = selectedDay?.freeSlots ?? [];
  // Buang slot yang jamnya sudah lewat (khusus hari ini).
  const futureSlots = slots.filter((slot) => new Date(slot.startTime).getTime() > loadedAt);
  const selectedBranch = branches.find((branch) => branch.id === branchId) ?? null;

  // Jam selesai hanya boleh setelah jam mulai.
  const startMinutes = startTime ? wibMinutesOf(startTime) : -1;
  const endCandidates: { value: string; label: string }[] = [];
  if (startTime) {
    const seen = new Set<string>();
    for (const slot of futureSlots) {
      const slotStart = wibMinutesOf(slot.startTime);
      if (slotStart <= startMinutes) continue;
      if (seen.has(slot.endTime)) continue;
      seen.add(slot.endTime);
      endCandidates.push({ value: slot.endTime, label: timeLabel(slot.endTime) });
    }
  }

  // Ringkasan biaya: total = sewa ruangan + order menu.
  const selectedRooms = areas.filter((area) => roomIds.includes(area.id));
  const durationMinutes =
    startTime && endTime
      ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
      : 0;
  const hours = durationMinutes > 0 ? durationMinutes / 60 : 0;
  const roomTotal = Math.round(
    selectedRooms.reduce((sum, area) => sum + (area.pricePerHourIdr ?? 0) * hours, 0),
  );
  const menuTotal = menuPicksTotal(menuPicks);
  const totalEstimate = roomTotal + menuTotal;
  const { deposit1, deposit2, settlement } = computeDepositStages(totalEstimate);
  const dp1Rule = describeDeposit1(totalEstimate);

  const toggleRoom = (id: string) => {
    setRoomIds((prev) => (prev.includes(id) ? prev.filter((roomId) => roomId !== id) : [...prev, id]));
    setFieldErrors((prev) => {
      if (!prev.rooms) return prev;
      const next = { ...prev };
      delete next.rooms;
      return next;
    });
    setSubmitError(null);
  };

  const submit = async () => {
    const errors: Record<string, string> = {};
    if (!branchId) errors.branchId = "Pilih cabang dulu";
    if (roomIds.length === 0) errors.rooms = "Pilih minimal satu ruangan";
    if (!startTime) errors.startTime = "Pilih jam mulai";
    if (!endTime) errors.endTime = "Pilih jam selesai";
    if (startTime && !endTime) errors.endTime = "Pilih jam selesai dulu ya";
    else if (startTime && endTime && new Date(endTime).getTime() <= new Date(startTime).getTime())
      errors.endTime = "Jam selesai harus setelah jam mulai";
    else if (startTime && new Date(startTime).getTime() <= loadedAt)
      errors.startTime = "Jam yang dipilih sudah lewat. Pilih jam lain ya.";
    if (contactPhone.trim().length < 7) errors.contactPhone = "Nomor telepon wajib diisi";
    if (!agreeDeposit) errors.deposit = "Kamu harus menyetujui ketentuan DP dulu";
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !branchId || !startTime || !endTime) return;

    setSubmitting(true);
    // Buka tab pembayaran sejak awal agar tidak diblokir popup blocker.
    let payTab: Window | null = null;
    try {
      payTab = window.open("about:blank", "_blank");
    } catch {
      payTab = null;
    }

    let tabUsed = false;
    try {
      // Gabungkan field yang belum punya kolom sendiri ke catatan staff.
      const extra: string[] = [];
      if (eventName.trim()) extra.push(`Event/Acara: ${eventName.trim()}`);
      if (roomIds.length > 1) {
        extra.push(`Ruangan: ${selectedRooms.map((area) => area.name).join(", ")}`);
      }
      if (roomTotal > 0) {
        extra.push(`Estimasi sewa ruangan: ${formatRupiah(roomTotal)} (${durationMinutes} menit)`);
      }
      if (menuPicks.length > 0) {
        const menuText = menuPicks.map((pick) => menuPickLabel(pick)).join(", ");
        extra.push(`Order menu: ${menuText} (${formatRupiah(menuTotal)})`);
      }
      if (orderNote.trim()) extra.push(`Catatan menu: ${orderNote.trim()}`);
      if (notes.trim()) extra.push(`Catatan: ${notes.trim()}`);
      extra.push("Menyetujui ketentuan DP: ya");

      const specialRequests = extra.join("\n").slice(0, 2000);

      const created = await createReservation({
        branchId,
        roomIds,
        reservedFor: startTime,
        reservedUntil: endTime,
        guestCount,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        // Order makanan/minuman ikut dikirim; harga final dihitung server.
        menuItems: menuPicks.map((pick) => ({
          productId: pick.productId,
          variantId: pick.variantId,
          quantity: pick.quantity,
          modifiers: (pick.modifierOptionIds ?? []).map((optionId) => ({
            optionId,
            quantity: 1,
          })),
        })),
        specialRequests: specialRequests.length ? specialRequests : undefined,
      });

      // DP1 wajib dibayar: buat charge lalu buka halaman pembayaran.
      try {
        const { payment } = await createReservationDepositCharge(created.reservation.id, "deposit");
        if (payment.paymentUrl) {
          if (payTab) {
            payTab.location.href = payment.paymentUrl;
            tabUsed = true;
          } else {
            window.open(payment.paymentUrl, "_blank", "noopener,noreferrer");
          }
        } else if (payTab) {
          payTab.close();
        }
      } catch (payErr) {
        if (payTab) payTab.close();
        // Reservasi tetap tersimpan; pelanggan bisa bayar DP1 dari halaman detail.
        setSubmitError(
          apiErrorFrom(
            payErr,
            "Reservasi dibuat, tetapi link pembayaran DP1 gagal dibuat. Buka detail reservasi untuk membayar.",
          ),
        );
      }

      useReservationDraftStore.getState().reset();
      try {
        sessionStorage.removeItem(FORM_DRAFT_KEY);
      } catch {
        // Abaikan bila storage diblokir.
      }
      router.replace(`/reservasi/${created.reservation.id}`);
    } catch (err) {
      if (payTab && !tabUsed) payTab.close();
      if (err instanceof ApiError) {
        // Backend memakai kunci field `reservedFor`/`reservedUntil`; petakan ke
        // kunci error layar ini (startTime/endTime/rooms).
        const mapped: Record<string, string> = { ...err.fieldErrors };
        if (mapped.reservedFor && !mapped.startTime) mapped.startTime = mapped.reservedFor;
        if (mapped.reservedUntil && !mapped.endTime) mapped.endTime = mapped.reservedUntil;
        if (mapped.roomIds && !mapped.rooms) mapped.rooms = mapped.roomIds;
        setFieldErrors(mapped);
        const onlyTimeIssue =
          Object.keys(mapped).length > 0 &&
          Object.keys(mapped).every((key) =>
            ["startTime", "endTime", "reservedFor", "reservedUntil"].includes(key),
          );
        setSubmitError(
          onlyTimeIssue
            ? "Jam yang dipilih sudah tidak tersedia. Silakan pilih jam lain."
            : err.message,
        );
      } else {
        setSubmitError(apiErrorFrom(err, "Gagal membuat reservasi"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" || bootstrapLoading) {
    return <Loader label="Menyiapkan form reservasi…" />;
  }

  if (bootstrapError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeader title="Buat Reservasi" onBack={() => router.back()} />
        <ErrorState message={bootstrapError} onRetry={() => void loadBranches()} />
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeader title="Buat Reservasi" onBack={() => router.back()} />
        <ErrorState
          message="Belum ada cabang yang bisa direservasi. Coba lagi nanti ya."
          onRetry={() => void loadBranches()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-4">
      <ScreenHeader
        title="Buat Reservasi"
        subtitle="Pesan ruangan untuk acara kamu"
        onBack={() => router.back()}
      />

      <div className="flex flex-col gap-3.5 pt-3.5">
        {/* Cabang */}
        <Card>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <p className="text-[15px] font-extrabold text-ink">Cabang</p>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {branches.map((branch) => (
              <Chip
                key={branch.id}
                label={branch.name}
                active={branch.id === branchId}
                onClick={() => {
                  setBranchId(branch.id);
                  setAreas([]);
                  setRoomIds([]);
                  setStartTime(null);
                  setEndTime(null);
                }}
              />
            ))}
          </div>
        </Card>

        {/* Jumlah orang */}
        <Card>
          <p className="text-[15px] font-extrabold text-ink">Jumlah orang</p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[13px] text-muted">Berapa orang yang akan datang?</p>
            <QuantityStepper value={guestCount} onChange={setGuestCount} min={1} max={100} />
          </div>
        </Card>

        {/* Tanggal */}
        <Card>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" />
            <p className="text-[15px] font-extrabold text-ink">Tanggal</p>
          </div>
          <div className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((item) => {
              const label = wibDateLabel(item);
              const active = date === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setDate(item);
                    setStartTime(null);
                    setEndTime(null);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-[62px] shrink-0 flex-col items-center rounded-[14px] border px-3 py-2.5 transition focus-ring",
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-cream/60 text-ink hover:border-primary/40",
                  )}>
                  <span className={cn("text-[11px] font-semibold", active ? "text-white/80" : "text-muted")}>
                    {label.weekday}
                  </span>
                  <span className="mt-0.5 text-[13px] font-extrabold">{label.day}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Rentang jam: mulai & selesai */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              <p className="text-[15px] font-extrabold text-ink">Waktu sewa</p>
            </div>
            {selectedDay && selectedDay.isOpen && selectedDay.openingTime ? (
              <p className="text-xs text-muted">
                Buka {selectedDay.openingTime.slice(0, 5)}–{(selectedDay.closingTime ?? "").slice(0, 5)}
              </p>
            ) : null}
          </div>

          <div className="mt-2.5">
            {availabilityLoading ? (
              <Loader label="Memeriksa ketersediaan…" fullscreen={false} />
            ) : availabilityError ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-danger">{availabilityError}</p>
                <Button
                  title="Coba lagi"
                  size="sm"
                  variant="outline"
                  fullWidth={false}
                  onClick={() => void loadAvailability()}
                />
              </div>
            ) : !selectedDay || !selectedDay.isOpen ? (
              <p className="text-[13px] text-muted">
                Cabang tutup pada tanggal ini. Coba pilih tanggal lain ya.
              </p>
            ) : futureSlots.length === 0 ? (
              <p className="text-[13px] text-muted">
                {slots.length > 0
                  ? "Semua jam pada tanggal ini sudah lewat. Pilih tanggal lain ya."
                  : "Tidak ada slot tersisa pada tanggal ini. Coba tanggal lain ya."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted">Jam mulai</p>
                  <div className="flex flex-wrap gap-2">
                    {futureSlots.map((slot) => (
                      <Chip
                        key={`start-${slot.startTime}`}
                        label={timeLabel(slot.startTime)}
                        size="sm"
                        active={startTime === slot.startTime}
                        onClick={() => {
                          setStartTime(slot.startTime);
                          if (endTime && new Date(endTime).getTime() <= new Date(slot.startTime).getTime()) {
                            setEndTime(null);
                          }
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.startTime;
                            delete next.endTime;
                            return next;
                          });
                          setSubmitError(null);
                        }}
                      />
                    ))}
                  </div>
                  {fieldErrors.startTime ? (
                    <p className="text-xs text-danger">{fieldErrors.startTime}</p>
                  ) : null}
                </div>

                {startTime ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted">Jam selesai</p>
                    {endCandidates.length === 0 ? (
                      <p className="text-xs text-muted">
                        Tidak ada jam selesai setelah {timeLabel(startTime)}. Pilih jam mulai lebih awal.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {endCandidates.map((option) => (
                          <Chip
                            key={`end-${option.value}`}
                            label={option.label}
                            size="sm"
                            active={endTime === option.value}
                            onClick={() => {
                              setEndTime(option.value);
                              setFieldErrors((prev) => {
                                if (!prev.endTime) return prev;
                                const next = { ...prev };
                                delete next.endTime;
                                return next;
                              });
                              setSubmitError(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {fieldErrors.endTime ? (
                      <p className="text-xs text-danger">{fieldErrors.endTime}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Pilih jam mulai dulu untuk menentukan jam selesai.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Ruangan (area) — bisa pilih lebih dari satu */}
        <Card>
          <p className="text-[15px] font-extrabold text-ink">Pilih Ruangan</p>
          <div className="mt-1 flex flex-col gap-1">
            {selectedBranch ? (
              <p className="flex items-center gap-1 text-xs text-muted">
                <MapPin size={13} />
                {selectedBranch.name}
              </p>
            ) : null}
            <p className="text-xs text-muted">
              {areas.length > 0
                ? "Pilih satu atau lebih ruangan dari foto di bawah. Bisa pilih beberapa sekaligus."
                : "Belum ada ruangan yang tersedia untuk cabang ini."}
            </p>
          </div>

          {areas.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {areas.map((area) => (
                <ImageChoiceCard
                  key={area.id}
                  title={area.name}
                  subtitle={areaSubtitle(area)}
                  imageUrl={area.imageUrl}
                  fallbackIcon={areaIcon(area.areaType)}
                  variant="tile"
                  selected={roomIds.includes(area.id)}
                  onPress={() => toggleRoom(area.id)}
                />
              ))}
            </div>
          ) : null}
          {fieldErrors.rooms ? <p className="mt-2 text-xs text-danger">{fieldErrors.rooms}</p> : null}
        </Card>

        {/* Detail acara */}
        <Card>
          <p className="text-[15px] font-extrabold text-ink">Detail acara</p>
          <div className="mt-2.5 flex flex-col gap-3">
            <TextField
              label="Nama"
              placeholder="Nama pemesan"
              icon={User}
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
            />
            <TextField
              label="No telp"
              placeholder="08xx xxxx xxxx"
              icon={Phone}
              inputMode="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              error={fieldErrors.contactPhone}
            />
            <TextField
              label="Event / Acara"
              placeholder="Ulang tahun, arisan, gathering…"
              icon={Sparkles}
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
            />

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted">Order menu / Package (opsional)</p>

              {menuPicks.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-xl border border-primary bg-primary-soft p-3">
                  {menuPicks.map((pick, index) => (
                    <div key={`${pick.productId}-${index}`} className="flex items-center gap-2">
                      <Utensils size={14} className="shrink-0 text-primary" />
                      <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{menuPickLabel(pick)}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <Button
                title={
                  menuPicks.length > 0
                    ? `Ubah pilihan menu (${menuPicks.length} item)`
                    : "Pilih menu kafe"
                }
                icon={Utensils}
                variant={menuPicks.length > 0 ? "outline" : "soft"}
                onClick={() => router.push("/reservasi/menu")}
              />

              <TextField
                label="Catatan menu (opsional)"
                placeholder="Contoh: nasi goreng tanpa pedas, es teh tanpa gula"
                icon={MessageSquare}
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
              />
            </div>

            <TextField
              label="Catatan tambahan (opsional)"
              placeholder="Permintaan khusus untuk staff"
              icon={MessageSquare}
              multiline
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </Card>

        {/* Ringkasan biaya */}
        {selectedRooms.length > 0 ? (
          <Card>
            <p className="text-[15px] font-extrabold text-ink">Ringkasan biaya</p>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">
                  Sewa {selectedRooms.length} ruangan · {hours > 0 ? `${hours} jam` : "pilih jam"}
                </p>
                <p className="text-[13px] font-bold text-ink">
                  {hours > 0 ? formatRupiah(roomTotal) : "—"}
                </p>
              </div>
              {menuPicks.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">Order menu ({menuPicks.length} item)</p>
                  <p className="text-[13px] font-bold text-ink">{formatRupiah(menuTotal)}</p>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <p className="text-[13px] font-bold text-ink">Total dibayar</p>
                <p className="text-sm font-extrabold text-ink">
                  {hours > 0 ? formatRupiah(totalEstimate) : "—"}
                </p>
              </div>
              <p className="text-[11px] leading-4 text-muted">
                DP dihitung dari total di atas (sewa ruangan + order menu), jadi uang muka ikut
                menutup makanan &amp; minuman yang dipesan.
              </p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">{dp1Rule.label}</p>
                <p className="text-[13px] font-bold text-primary">{formatRupiah(deposit1)}</p>
              </div>
              <p className="text-[11px] leading-4 text-muted">{dp1Rule.note}</p>
              {hours > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-muted">
                      DP2 ({DEPOSIT_TERMS.dp2Percent}% dari sisa)
                    </p>
                    <p className="text-[13px] font-semibold text-ink">{formatRupiah(deposit2)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-muted">Pelunasan</p>
                    <p className="text-[13px] font-semibold text-ink">{formatRupiah(settlement)}</p>
                  </div>
                </>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* Ketentuan DP */}
        <Card>
          <p className="text-[15px] font-extrabold text-ink">Ketentuan uang muka (DP)</p>
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <Wallet size={15} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[13px] leading-5 text-muted">
                DP1 otomatis {DEPOSIT_TERMS.dp1Percent}% dari total (sewa ruangan + order menu),
                minimal {formatRupiah(DEPOSIT_TERMS.dp1MinIdr)}, maksimal{" "}
                {formatRupiah(DEPOSIT_TERMS.dp1MaxIdr)}, dibayar saat mengisi formulir
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl bg-primary-soft p-3">
              <p className="text-xs font-bold text-ink">Aturan harga DP1 (otomatis oleh sistem)</p>
              <p className="text-xs leading-[18px] text-muted">
                • Total (sewa + menu) di bawah Rp1.000.000 → DP1{" "}
                {formatRupiah(DEPOSIT_TERMS.dp1MinIdr)} (nilai minimum)
              </p>
              <p className="text-xs leading-[18px] text-muted">
                • Total (sewa + menu) Rp1.000.000–Rp1.666.666 → DP1 {DEPOSIT_TERMS.dp1Percent}% dari
                total
              </p>
              <p className="text-xs leading-[18px] text-muted">
                • Total (sewa + menu) di atas Rp1.666.666 → DP1{" "}
                {formatRupiah(DEPOSIT_TERMS.dp1MaxIdr)} (nilai maksimum)
              </p>
              {hours > 0 ? (
                <p className="text-xs font-semibold leading-[18px] text-primary">{dp1Rule.note}</p>
              ) : null}
            </div>
            <div className="flex items-start gap-2">
              <PieChart size={15} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[13px] leading-5 text-muted">
                DP2 otomatis {DEPOSIT_TERMS.dp2Percent}% dari sisa setelah DP1, lalu reservasi
                dikonfirmasi staff
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[13px] leading-5 text-muted">
                Pelunasan = sisa total (sewa ruangan + order menu)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setAgreeDeposit((prev) => !prev);
              setFieldErrors((prev) => {
                if (!prev.deposit) return prev;
                const next = { ...prev };
                delete next.deposit;
                return next;
              });
            }}
            aria-pressed={agreeDeposit}
            className="mt-3 flex w-full items-start gap-2.5 text-left focus-ring">
            {agreeDeposit ? (
              <CheckCircle2 size={22} className="mt-px shrink-0 text-primary" />
            ) : (
              <Square size={22} className="mt-px shrink-0 text-muted" />
            )}
            <span className="flex-1 text-[13px] leading-5 text-ink">
              Saya menyetujui ketentuan DP 3 tahap. DP1 wajib dibayar lewat Midtrans; DP2 terbuka
              setelah reservasi dikonfirmasi staff.
            </span>
          </button>
          {fieldErrors.deposit ? <Badge label={fieldErrors.deposit} tone="danger" className="mt-2" /> : null}
        </Card>

        {submitError ? <Badge label={submitError} tone="danger" /> : null}
      </div>

      {/* Bar aksi */}
      <div className="sticky bottom-0 z-20 mt-3.5 flex flex-col gap-2 border-t border-line bg-surface/98 py-3 backdrop-blur">
        <Button
          title="Kirim & Bayar DP1"
          icon={CreditCard}
          loading={submitting}
          onClick={() => void submit()}
        />
        <p className="text-center text-[11px] text-muted">
          DP1 wajib dibayar lewat Midtrans saat mengirim. Reservasi berstatus “Menunggu konfirmasi”
          sampai staff menerima.
        </p>
      </div>
    </div>
  );
}
