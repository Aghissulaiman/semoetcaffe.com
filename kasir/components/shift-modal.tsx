"use client";

import {
  ArrowRightLeft,
  Clock3,
  Loader2,
  Play,
  Save,
  Square,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  api,
  apiErrorFrom,
  type ApiShift,
  type ApiShiftStaff,
  type ApiUser,
} from "@/lib/api";
import {
  formatDateTime,
  formatDuration,
  formatRupiah,
  formatTime,
} from "@/lib/format";

function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function addHours(date: Date, hours: number): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function defaultPlannedTimes(): { start: string; end: string } {
  const now = new Date();
  return {
    start: timeInputValue(now),
    end: timeInputValue(addHours(now, 8)),
  };
}

function timeInputFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeInputValue(date);
}

/**
 * Ubah dua input jam (HH:mm) menjadi timestamp ISO. Shift yang melewati tengah
 * malam (mis. 22:00–06:00) otomatis memakai tanggal berikutnya.
 */
function plannedRangeIso(
  startTime: string,
  endTime: string,
  baseDate: Date = new Date(),
): { plannedStartAt: string; plannedEndAt: string } | null {
  if (!startTime || !endTime) return null;

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if (
    ![startHour, startMinute, endHour, endMinute].every((value) =>
      Number.isFinite(value),
    )
  ) {
    return null;
  }

  const start = new Date(baseDate);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(baseDate);
  end.setHours(endHour, endMinute, 0, 0);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (endMinutes <= startMinutes) {
    // Jam selesai lebih kecil/sama = lewat tengah malam. Kalau baseDate masih
    // sebelum jam selesai, berarti shift dimulai kemarin.
    if (baseDate.getTime() < end.getTime()) {
      start.setDate(start.getDate() - 1);
    } else {
      end.setDate(end.getDate() + 1);
    }
  } else if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return {
    plannedStartAt: start.toISOString(),
    plannedEndAt: end.toISOString(),
  };
}

interface ShiftModalProps {
  open: boolean;
  onClose: () => void;
  branchId: string | null;
  branchName: string;
  shift: ApiShift | null;
  user: ApiUser | null;
  onChanged: () => void;
}

export function ShiftModal({
  open,
  onClose,
  branchId,
  branchName,
  shift,
  user,
  onChanged,
}: ShiftModalProps) {
  const [staffAccounts, setStaffAccounts] = useState<ApiShiftStaff[]>([]);
  const [staffUserId, setStaffUserId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [plannedStart, setPlannedStart] = useState(
    () => defaultPlannedTimes().start,
  );
  const [plannedEnd, setPlannedEnd] = useState(
    () => defaultPlannedTimes().end,
  );
  const [notes, setNotes] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);
  const [editPlannedStart, setEditPlannedStart] = useState("");
  const [editPlannedEnd, setEditPlannedEnd] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [handoverMode, setHandoverMode] = useState(false);
  const [nextStaffUserId, setNextStaffUserId] = useState("");
  const [nextOpeningCash, setNextOpeningCash] = useState("0");
  const [nextPlannedStart, setNextPlannedStart] = useState(
    () => defaultPlannedTimes().start,
  );
  const [nextPlannedEnd, setNextPlannedEnd] = useState(
    () => defaultPlannedTimes().end,
  );
  const [nextNotes, setNextNotes] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeShift = shift?.status === "open" ? shift : null;

  const selectedStaff = useMemo(
    () => staffAccounts.find((staff) => staff.id === staffUserId) ?? null,
    [staffAccounts, staffUserId],
  );

  const eligibleNextStaff = useMemo(
    () =>
      staffAccounts.filter(
        (staff) => staff.id !== activeShift?.staffUserId,
      ),
    [staffAccounts, activeShift?.staffUserId],
  );
  const nextStaffId = nextStaffUserId || eligibleNextStaff[0]?.id || "";
  const selectedNextStaff =
    eligibleNextStaff.find((staff) => staff.id === nextStaffId) ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadStaff() {
      try {
        const rows = await api<ApiShiftStaff[]>("/admin/shifts/staff");
        if (cancelled) return;
        setStaffAccounts(rows);
        setStaffUserId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          const currentUser = rows.find((row) => row.id === user?.id);
          return currentUser?.id ?? rows[0]?.id ?? "";
        });
      } catch (err) {
        if (!cancelled) setError(apiErrorFrom(err, "Gagal memuat akun staf"));
      } finally {
        if (!cancelled) setLoadingStaff(false);
      }
    }

    void loadStaff();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  async function handleStart() {
    if (!branchId || !staffUserId || submitting) return;
    const planned = plannedRangeIso(plannedStart, plannedEnd);
    if (!planned) {
      setError("Isi jam mulai dan jam selesai rencana shift");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api<ApiShift>("/admin/shifts/start", {
        method: "POST",
        body: {
          branchId,
          staffUserId,
          openingCashIdr: Number(openingCash || 0),
          plannedStartAt: planned.plannedStartAt,
          plannedEndAt: planned.plannedEndAt,
          notes: notes.trim() || undefined,
        },
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Shift gagal dibuka"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (!activeShift || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api<ApiShift>(`/admin/shifts/${activeShift.id}/close`, {
        method: "POST",
        body: {
          closingCashIdr: Number(closingCash || 0),
          notes: closingNotes.trim() || undefined,
        },
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Shift gagal ditutup"));
    } finally {
      setSubmitting(false);
    }
  }

  function openPlanEditor() {
    if (!activeShift) return;
    const base = new Date(
      activeShift.plannedStartAt ?? activeShift.openedAt ?? Date.now(),
    );
    const endBase = activeShift.plannedEndAt
      ? new Date(activeShift.plannedEndAt)
      : addHours(base, 8);
    setEditPlannedStart(
      activeShift.plannedStartAt
        ? timeInputFromIso(activeShift.plannedStartAt)
        : timeInputValue(base),
    );
    setEditPlannedEnd(
      activeShift.plannedEndAt
        ? timeInputFromIso(activeShift.plannedEndAt)
        : timeInputValue(endBase),
    );
    setEditingPlan(true);
  }

  async function handleSavePlan() {
    if (!activeShift || planSaving) return;
    const base = activeShift.plannedStartAt ?? activeShift.openedAt;
    const planned = plannedRangeIso(
      editPlannedStart,
      editPlannedEnd,
      base ? new Date(base) : new Date(),
    );
    if (!planned) {
      setError("Isi jam mulai dan jam selesai rencana shift");
      return;
    }
    setPlanSaving(true);
    setError(null);
    try {
      await api<ApiShift>(`/admin/shifts/${activeShift.id}/plan`, {
        method: "PATCH",
        body: planned,
      });
      setEditingPlan(false);
      onChanged();
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal menyimpan jam rencana"));
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleHandover() {
    if (!activeShift || !nextStaffId || submitting) return;
    const planned = plannedRangeIso(nextPlannedStart, nextPlannedEnd);
    if (!planned) {
      setError("Isi jam mulai dan jam selesai rencana shift berikutnya");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api<{ previous: ApiShift; active: ApiShift }>(
        `/admin/shifts/${activeShift.id}/handover`,
        {
          method: "POST",
          body: {
            staffUserId: nextStaffId,
            closingCashIdr: Number(closingCash || 0),
            openingCashIdr: Number(nextOpeningCash || 0),
            plannedStartAt: planned.plannedStartAt,
            plannedEndAt: planned.plannedEndAt,
            closingNotes: closingNotes.trim() || undefined,
            notes: nextNotes.trim() || undefined,
          },
        },
      );
      onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Pergantian shift gagal diproses"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={activeShift ? "Shift Aktif" : "Mulai Shift"}
      subtitle={`${branchName} · pilih akun yang terdaftar sebagai role Staff`}
      size="md"
      footer={
        activeShift ? (
          handoverMode ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setHandoverMode(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                className="flex-1"
                onClick={() => void handleHandover()}
                disabled={
                  submitting ||
                  loadingStaff ||
                  !nextStaffId ||
                  !nextPlannedStart ||
                  !nextPlannedEnd ||
                  closingCash.trim() === ""
                }
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowRightLeft size={16} />
                )}
                Proses Ganti Shift
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setHandoverMode(true)}
                disabled={submitting || loadingStaff}
              >
                <ArrowRightLeft size={16} />
                Ganti Shift
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => void handleClose()}
                disabled={submitting || closingCash.trim() === ""}
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Square size={16} />
                )}
                Tutup Shift
              </Button>
            </div>
          )
        ) : (
          <Button
            className="w-full"
            onClick={() => void handleStart()}
            disabled={
              submitting ||
              loadingStaff ||
              !staffUserId ||
              !plannedStart ||
              !plannedEnd
            }
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            Buka Shift
          </Button>
        )
      }
    >
      {error ? (
        <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {activeShift ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-milk/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  Petugas shift
                </p>
                <p className="mt-1 text-lg font-black text-ink">
                  {activeShift.staffName}
                </p>
                <p className="text-xs text-muted">
                  {activeShift.staffEmail ?? "Akun staf"}
                </p>
              </div>
              <Badge tone="success">Aktif</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted">Mulai aktual</p>
                <p className="font-bold text-ink">
                  {formatTime(activeShift.openedAt)}
                </p>
                <p className="text-[10px] text-muted">
                  {formatDateTime(activeShift.openedAt)}
                </p>
              </div>
              <div>
                <p className="text-muted">Durasi aktual</p>
                <p className="font-bold text-ink">
                  {formatDuration(activeShift.durationMinutes)}
                </p>
                <p className="text-[10px] text-muted">
                  Dibuka oleh {activeShift.openedByName ?? "-"}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Rencana shift
                </p>
                {!editingPlan ? (
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-black text-ink tabular">
                      {activeShift.plannedStartAt && activeShift.plannedEndAt
                        ? `${formatTime(
                            activeShift.plannedStartAt,
                          )} – ${formatTime(activeShift.plannedEndAt)}`
                        : "Belum diatur"}
                    </p>
                    <button
                      type="button"
                      onClick={openPlanEditor}
                      className="focus-ring rounded-md px-2 py-1 text-[10px] font-bold text-primary transition hover:bg-primary-soft"
                    >
                      Ubah
                    </button>
                  </div>
                ) : null}
              </div>

              {editingPlan ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Mulai" required>
                      <Input
                        type="time"
                        value={editPlannedStart}
                        onChange={(event) =>
                          setEditPlannedStart(event.target.value)
                        }
                        className="text-sm font-bold tabular"
                      />
                    </Field>
                    <Field label="Selesai" required>
                      <Input
                        type="time"
                        value={editPlannedEnd}
                        onChange={(event) =>
                          setEditPlannedEnd(event.target.value)
                        }
                        className="text-sm font-bold tabular"
                      />
                    </Field>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted">
                    Jam selesai lebih kecil dari jam mulai dianggap melewati
                    tengah malam.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setEditingPlan(false)}
                      disabled={planSaving}
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => void handleSavePlan()}
                      disabled={
                        planSaving || !editPlannedStart || !editPlannedEnd
                      }
                    >
                      {planSaving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      Simpan
                    </Button>
                  </div>
                </div>
              ) : activeShift.plannedDurationMinutes !== null ? (
                <p className="mt-0.5 text-[10px] text-muted">
                  Durasi rencana{" "}
                  {formatDuration(activeShift.plannedDurationMinutes)}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-muted">
                  Jam rencana belum diatur. Klik “Ubah” untuk mengisi.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Kas awal
              </p>
              <p className="mt-1 text-sm font-black text-ink tabular">
                {formatRupiah(activeShift.openingCashIdr)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Kas seharusnya
              </p>
              <p className="mt-1 text-sm font-black text-primary tabular">
                {formatRupiah(activeShift.expectedCashIdr)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Penjualan tunai
              </p>
              <p className="mt-1 text-sm font-black text-ink tabular">
                {formatRupiah(activeShift.cashSalesIdr)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Non-tunai
              </p>
              <p className="mt-1 text-sm font-black text-ink tabular">
                {formatRupiah(activeShift.nonCashSalesIdr)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-xs text-ink-soft">
            <Clock3 size={14} className="shrink-0 text-primary" />
            <span>
              {activeShift.orderCount} pesanan lunas · total{" "}
              <strong>{formatRupiah(activeShift.salesIdr)}</strong>
            </span>
          </div>

          {handoverMode ? (
            <div className="rounded-xl border border-primary/20 bg-primary-soft px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                Pergantian shift
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                <span>{activeShift.staffName}</span>
                <ArrowRightLeft size={12} className="shrink-0 text-primary" />
                <span>{selectedNextStaff?.displayName ?? "Pilih staf berikutnya"}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted">
                Shift lama ditutup dan shift baru langsung aktif dalam satu
                proses.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3">
            <Field
              label={
                handoverMode
                  ? "Kas akhir shift saat ini"
                  : "Kas akhir dihitung"
              }
              hint={`Kas seharusnya ${formatRupiah(activeShift.expectedCashIdr)}. Masukkan uang fisik di drawer.`}
              required
            >
              <Input
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={closingCash}
                onChange={(event) => setClosingCash(event.target.value)}
                placeholder={String(activeShift.expectedCashIdr)}
              />
            </Field>
            <Field
              label={
                handoverMode ? "Catatan serah terima" : "Catatan penutupan"
              }
              hint="Opsional, mis. selisih kas atau serah terima."
            >
              <TextArea
                value={closingNotes}
                onChange={(event) => setClosingNotes(event.target.value)}
                placeholder="Contoh: serah terima ke shift berikutnya"
                maxLength={500}
              />
            </Field>

            {handoverMode ? (
              loadingStaff ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-milk/70 py-6 text-xs font-semibold text-muted">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  Memuat akun staf…
                </div>
              ) : eligibleNextStaff.length === 0 ? (
                <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                  Belum ada akun staf lain. Tambahkan akun dengan role Staff
                  untuk melakukan pergantian shift.
                </p>
              ) : (
                <>
                  <Field
                    label="Akun staf shift berikutnya"
                    hint="Pilih akun yang akan menerima serah terima."
                    required
                  >
                    <Select
                      value={nextStaffId}
                      onChange={(event) =>
                        setNextStaffUserId(event.target.value)
                      }
                    >
                      {eligibleNextStaff.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.displayName}
                          {staff.email ? ` · ${staff.email}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {selectedNextStaff ? (
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-milk/70 p-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <UserRound size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-ink">
                          {selectedNextStaff.displayName}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {selectedNextStaff.email ??
                            selectedNextStaff.phoneE164 ??
                            "Akun staf"}
                        </p>
                      </div>
                      <Badge tone="brown" className="ml-auto">
                        Staff
                      </Badge>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-line bg-milk/60 p-3">
                    <div className="flex items-center gap-2">
                      <Clock3 size={14} className="text-primary" />
                      <p className="text-xs font-black text-ink">
                        Jam rencana shift baru
                      </p>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                      <Field label="Mulai" required>
                        <Input
                          type="time"
                          value={nextPlannedStart}
                          onChange={(event) =>
                            setNextPlannedStart(event.target.value)
                          }
                          className="text-sm font-bold tabular"
                        />
                      </Field>
                      <Field label="Selesai" required>
                        <Input
                          type="time"
                          value={nextPlannedEnd}
                          onChange={(event) =>
                            setNextPlannedEnd(event.target.value)
                          }
                          className="text-sm font-bold tabular"
                        />
                      </Field>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-muted">
                      Jam selesai lebih kecil dari jam mulai dianggap melewati
                      tengah malam.
                    </p>
                  </div>

                  <Field
                    label="Kas awal shift baru"
                    hint="Uang tunai yang disiapkan untuk shift berikutnya."
                  >
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      inputMode="numeric"
                      value={nextOpeningCash}
                      onChange={(event) =>
                        setNextOpeningCash(event.target.value)
                      }
                    />
                  </Field>

                  <Field
                    label="Catatan shift baru"
                    hint="Opsional, mis. kondisi drawer atau instruksi."
                  >
                    <TextArea
                      value={nextNotes}
                      onChange={(event) => setNextNotes(event.target.value)}
                      placeholder="Contoh: lanjutkan shift malam"
                      maxLength={500}
                    />
                  </Field>
                </>
              )
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {loadingStaff ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-milk/70 py-8 text-xs font-semibold text-muted">
              <Loader2 size={16} className="animate-spin text-primary" />
              Memuat akun staf…
            </div>
          ) : staffAccounts.length === 0 ? (
            <EmptyState
              icon={<UserRound size={22} />}
              title="Belum ada akun role Staff"
              description="Tambahkan role Staff ke akun kasir di panel admin. Shift hanya bisa dibuka memakai akun yang sudah terdaftar, bukan nama manual."
            />
          ) : (
            <>
              <Field
                label="Akun staf yang bertugas"
                hint="Daftar ini hanya berisi akun aktif dengan role Staff."
                required
              >
                <Select
                  value={staffUserId}
                  onChange={(event) => setStaffUserId(event.target.value)}
                >
                  {staffAccounts.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.displayName}
                      {staff.email ? ` · ${staff.email}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedStaff ? (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-milk/70 p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <UserRound size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">
                      {selectedStaff.displayName}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {selectedStaff.email ?? selectedStaff.phoneE164 ?? "Akun staf"}
                    </p>
                  </div>
                  <Badge tone="brown" className="ml-auto">
                    Staff
                  </Badge>
                </div>
              ) : null}

              <div className="rounded-xl border border-line bg-milk/60 p-3">
                <div className="flex items-center gap-2">
                  <Clock3 size={14} className="text-primary" />
                  <p className="text-xs font-black text-ink">Jam rencana shift</p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  Rentang waktu shift ini direncanakan. Jam aktual tetap
                  mengikuti kapan shift dibuka dan ditutup.
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <Field label="Mulai" required>
                    <Input
                      type="time"
                      value={plannedStart}
                      onChange={(event) => setPlannedStart(event.target.value)}
                      className="text-sm font-bold tabular"
                    />
                  </Field>
                  <Field label="Selesai" required>
                    <Input
                      type="time"
                      value={plannedEnd}
                      onChange={(event) => setPlannedEnd(event.target.value)}
                      className="text-sm font-bold tabular"
                    />
                  </Field>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  Jika jam selesai lebih kecil dari jam mulai, shift dianggap
                  melewati tengah malam. Contoh: 22.00–06.00.
                </p>
              </div>

              <Field
                label="Kas awal (opsional)"
                hint="Uang tunai yang disiapkan di drawer sebelum shift dimulai."
              >
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  inputMode="numeric"
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                />
              </Field>

              <Field label="Catatan shift" hint="Opsional, mis. jadwal atau serah terima.">
                <TextArea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Contoh: shift pagi, serah terima dari Budi"
                  maxLength={500}
                />
              </Field>

              <div className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
                <Wallet size={14} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  Setelah shift dibuka, transaksi kasir di cabang ini tercatat
                  dalam shift tersebut. Tutup shift saat serah terima agar kas
                  akhir dan rekap penjualan tersimpan.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
