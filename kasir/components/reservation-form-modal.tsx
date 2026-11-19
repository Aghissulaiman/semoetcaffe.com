"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Button, Field, Input, Modal, Select, TextArea } from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import { useKasir } from "@/lib/store";
import type { NewReservationInput } from "@/lib/types";
import { useToday } from "@/lib/use-today";

interface ReservationFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewReservationInput) => Promise<void> | void;
}

interface FormState {
  name: string;
  phone: string;
  date: string;
  time: string;
  durationMinutes: number;
  guests: number;
  areaId: string;
  tableId: string;
  note: string;
}

const DURATIONS = [60, 90, 120, 180, 240];

function initialState(): FormState {
  return {
    name: "",
    phone: "",
    date: "",
    time: "19:00",
    durationMinutes: 90,
    guests: 2,
    areaId: "",
    tableId: "",
    note: "",
  };
}

export function ReservationFormModal({
  open,
  onClose,
  onSubmit,
}: ReservationFormModalProps) {
  const { areas, tables } = useKasir();
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useToday();
  const dateValue = form.date || today || "";

  const availableTables = useMemo(
    () =>
      form.areaId
        ? tables.filter((table) => table.areaId === form.areaId)
        : tables,
    [tables, form.areaId],
  );

  function resetForm() {
    setForm(initialState());
    setErrors({});
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    resetForm();
    onClose();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setError(null);
  }

  const endTime = useMemo(() => {
    const [hour, minute] = form.time.split(":").map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return "-";
    const total = hour * 60 + minute + form.durationMinutes;
    const endHour = Math.floor(total / 60) % 24;
    const endMinute = total % 60;
    return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
  }, [form.time, form.durationMinutes]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) nextErrors.name = "Nama tamu wajib diisi.";
    if (!form.phone.trim()) nextErrors.phone = "Nomor WhatsApp wajib diisi.";
    if (!dateValue) nextErrors.date = "Tanggal wajib dipilih.";
    if (!form.time) nextErrors.time = "Jam mulai wajib diisi.";
    if (form.guests < 1) nextErrors.guests = "Jumlah tamu minimal 1.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        phone: form.phone.trim(),
        date: dateValue,
        time: form.time,
        durationMinutes: form.durationMinutes,
        guests: form.guests,
        areaId: form.areaId || null,
        tableIds: form.tableId ? [form.tableId] : [],
        note: form.note,
      });
      resetForm();
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Reservasi gagal disimpan"));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedArea = areas.find((area) => area.id === form.areaId);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Buat Reservasi"
      subtitle="Catat booking meja atau ruangan dari tamu."
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            form="reservation-form"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CalendarPlus size={16} />
            )}
            {submitting ? "Menyimpan…" : "Simpan Reservasi"}
          </Button>
        </div>
      }
    >
      <form
        id="reservation-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {error ? (
          <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama tamu" required>
            <Input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Nama lengkap"
            />
            {errors.name ? (
              <span className="text-[11px] font-semibold text-danger">
                {errors.name}
              </span>
            ) : null}
          </Field>
          <Field label="No. WhatsApp" required>
            <Input
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
            />
            {errors.phone ? (
              <span className="text-[11px] font-semibold text-danger">
                {errors.phone}
              </span>
            ) : null}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tanggal" required>
            <Input
              type="date"
              value={dateValue}
              min={today ?? undefined}
              onChange={(event) => update("date", event.target.value)}
            />
            {errors.date ? (
              <span className="text-[11px] font-semibold text-danger">
                {errors.date}
              </span>
            ) : null}
          </Field>
          <Field label="Jam mulai" required>
            <Input
              type="time"
              value={form.time}
              onChange={(event) => update("time", event.target.value)}
            />
            {errors.time ? (
              <span className="text-[11px] font-semibold text-danger">
                {errors.time}
              </span>
            ) : null}
          </Field>
          <Field label="Durasi">
            <Select
              value={String(form.durationMinutes)}
              onChange={(event) =>
                update("durationMinutes", Number(event.target.value))
              }
            >
              {DURATIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} menit
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Jumlah tamu" required>
            <Input
              type="number"
              min={1}
              max={1000}
              value={form.guests}
              onChange={(event) =>
                update("guests", Number(event.target.value) || 1)
              }
            />
            {errors.guests ? (
              <span className="text-[11px] font-semibold text-danger">
                {errors.guests}
              </span>
            ) : null}
          </Field>
          <Field label="Area / ruangan">
            <Select
              value={form.areaId}
              onChange={(event) => {
                update("areaId", event.target.value);
                update("tableId", "");
              }}
            >
              <option value="">Area reguler</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                  {area.pricePerHour > 0
                    ? ` · Rp${area.pricePerHour.toLocaleString("id-ID")}/jam`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Meja (opsional)">
            <Select
              value={form.tableId}
              onChange={(event) => update("tableId", event.target.value)}
            >
              <option value="">Belum ditentukan</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code}
                  {table.areaName ? ` · ${table.areaName}` : ""} (
                  {table.capacity} org)
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Catatan">
          <TextArea
            value={form.note}
            onChange={(event) => update("note", event.target.value)}
            placeholder="Contoh: dekorasi ulang tahun, meja dekat jendela…"
          />
        </Field>

        <div className="rounded-xl bg-milk px-3 py-2.5 text-xs text-ink-soft">
          <span className="font-bold text-ink">Jadwal:</span> {dateValue} ·{" "}
          {form.time}–{endTime} · {form.guests} tamu ·{" "}
          {selectedArea?.name ?? "Area reguler"}
          {form.tableId
            ? ` · ${tables.find((table) => table.id === form.tableId)?.code ?? "Meja"}`
            : ""}
        </div>
      </form>
    </Modal>
  );
}
