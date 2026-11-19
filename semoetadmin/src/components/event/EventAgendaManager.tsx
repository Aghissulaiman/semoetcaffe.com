"use client";

import AppModal from "@/components/common/AppModal";
import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import {
  EmptyBlock,
  ErrorBlock,
  Skeleton,
} from "@/components/common/DataState";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { useIsClient } from "@/hooks/useIsClient";
import { ApiError, apiDelete, apiPatch, apiPost } from "@/lib/client";
import { formatDate, toDateInputValue } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { EventAgenda } from "@/types/api";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TrashBinIcon,
} from "@/icons";

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** "2026-03-01" -> Date lokal (tanpa pergeseran timezone). */
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Sel kalender Senin-Minggu; null = padding sebelum/ sesudah bulan. */
function buildCalendarCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const leading = (first.getDay() + 6) % 7;
  const totalDays = endOfMonth(month).getDate();

  const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isWithinAgenda(agenda: EventAgenda, dateKey: string): boolean {
  return agenda.startsOn <= dateKey && dateKey <= agenda.endsOn;
}

function agendaRangeLabel(agenda: EventAgenda): string {
  if (agenda.startsOn === agenda.endsOn)
    return formatDate(fromDateKey(agenda.startsOn));
  return `${formatDate(fromDateKey(agenda.startsOn))} – ${formatDate(fromDateKey(agenda.endsOn))}`;
}

type FormMode = {
  open: boolean;
  agenda?: EventAgenda | null;
  defaultDate?: string | null;
};

/**
 * Pengelola agenda event (Ramadan, Lebaran, promo musiman, dsb).
 * Ditampilkan sebagai tab di halaman Booking Event.
 */
export default function EventAgendaManager() {
  const isClient = useIsClient();
  if (!isClient) return <Skeleton className="h-[420px] w-full" />;
  return <EventAgendaBoard />;
}

function EventAgendaBoard() {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [form, setForm] = useState<FormMode>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<EventAgenda | null>(null);

  const from = toDateInputValue(startOfMonth(month));
  const to = toDateInputValue(endOfMonth(month));

  const agenda = useApi<EventAgenda[]>(
    `/admin/event-agenda?limit=100&from=${from}&to=${to}`,
  );

  const items = agenda.data ?? [];
  const cells = useMemo(() => buildCalendarCells(month), [month]);
  const monthLabel = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(month);
  const todayKey = toDateInputValue(new Date());

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/event-agenda/${deleteTarget.id}`);
    setDeleteTarget(null);
    agenda.reload();
  };

  return (
    <>
      <ComponentCard
        title="Agenda Event"
        desc="Tandai tanggal-tanggal penting: Ramadan, Lebaran, promo musiman, dan acara lainnya"
        action={
          <button
            type="button"
            onClick={() =>
              setForm({ open: true, agenda: null, defaultDate: null })
            }
            className={primaryButtonClass}
          >
            <PlusIcon className="h-4 w-4" /> Tambah Event
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Bulan sebelumnya"
              onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-coffee-linen text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <p className="min-w-[150px] text-center text-theme-sm font-semibold text-coffee-espresso capitalize dark:text-coffee-cream">
              {monthLabel}
            </p>
            <button
              type="button"
              aria-label="Bulan berikutnya"
              onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-coffee-linen text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="ms-1 rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
            >
              Bulan ini
            </button>
          </div>
          <div className="flex items-center gap-3 text-theme-xs text-coffee-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-coffee-brown dark:bg-coffee-caramel" />{" "}
              Agenda aktif
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-coffee-linen dark:bg-white/20" />{" "}
              Nonaktif
            </span>
          </div>
        </div>

        {agenda.loading && !agenda.data ? (
          <Skeleton className="h-[360px] w-full" />
        ) : agenda.error ? (
          <ErrorBlock message={agenda.error} onRetry={agenda.reload} />
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="pb-1 text-center text-theme-xs font-semibold tracking-wide text-coffee-muted uppercase"
                  >
                    {label}
                  </div>
                ))}
                {cells.map((date, index) => {
                  if (!date)
                    return <div key={`pad-${index}`} className="min-h-24" />;
                  const dateKey = toDateInputValue(date);
                  const dayAgendas = items.filter((item) =>
                    isWithinAgenda(item, dateKey),
                  );
                  const isToday = dateKey === todayKey;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      title="Tambah event pada tanggal ini"
                      onClick={() =>
                        setForm({
                          open: true,
                          agenda: null,
                          defaultDate: dateKey,
                        })
                      }
                      className={cn(
                        "flex min-h-24 flex-col items-stretch gap-1 rounded-lg border p-1.5 text-start align-top transition-colors",
                        dayAgendas.length > 0
                          ? "border-coffee-brown/30 bg-coffee-brown/5 dark:border-coffee-caramel/30 dark:bg-coffee-caramel/10"
                          : "border-coffee-linen bg-white hover:border-coffee-brown/40 hover:bg-coffee-milk/60 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:hover:border-coffee-caramel/40 dark:hover:bg-white/5",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-theme-xs font-semibold",
                          isToday
                            ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                            : "text-coffee-dark dark:text-coffee-cream/80",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      <span className="flex flex-col gap-1">
                        {dayAgendas.slice(0, 2).map((item) => (
                          <span
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setForm({ open: true, agenda: item });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                setForm({ open: true, agenda: item });
                              }
                            }}
                            className={cn(
                              "truncate rounded px-1.5 py-0.5 text-theme-xs font-medium",
                              item.isActive
                                ? "bg-coffee-brown/15 text-coffee-brown dark:bg-coffee-caramel/20 dark:text-coffee-caramel"
                                : "bg-coffee-linen/70 text-coffee-muted line-through dark:bg-white/10",
                            )}
                          >
                            {item.title}
                          </span>
                        ))}
                        {dayAgendas.length > 2 && (
                          <span className="px-1 text-theme-xs text-coffee-muted">
                            +{dayAgendas.length - 2} lagi
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-theme-xs text-coffee-muted">
                Klik tanggal untuk menambah event, atau klik nama event untuk
                mengubahnya.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                Agenda bulan ini
              </h4>
              {items.length === 0 ? (
                <EmptyBlock message="Belum ada agenda pada bulan ini" />
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl border p-4 transition-colors",
                      item.isActive
                        ? "border-coffee-linen bg-white dark:border-coffee-night-border dark:bg-coffee-night-soft"
                        : "border-coffee-linen bg-coffee-milk/40 dark:border-coffee-night-border dark:bg-white/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate font-semibold",
                            item.isActive
                              ? "text-coffee-espresso dark:text-coffee-cream"
                              : "text-coffee-muted line-through",
                          )}
                        >
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-theme-xs text-coffee-muted">
                          {agendaRangeLabel(item)}
                        </p>
                      </div>
                      <ToneBadge tone={item.isActive ? "success" : "muted"}>
                        {item.isActive ? "Aktif" : "Nonaktif"}
                      </ToneBadge>
                    </div>
                    {item.description && (
                      <p className="mt-2 line-clamp-3 text-theme-xs whitespace-pre-wrap text-coffee-muted">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ open: true, agenda: item })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-linen px-2.5 py-1.5 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
                      >
                        <PencilIcon className="h-3.5 w-3.5" /> Ubah
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-danger/30 px-2.5 py-1.5 text-theme-xs font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10"
                      >
                        <TrashBinIcon className="h-3.5 w-3.5" /> Hapus
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </ComponentCard>

      {form.open && (
        <EventAgendaFormModal
          key={form.agenda?.id ?? `new-${form.defaultDate ?? ""}`}
          agenda={form.agenda ?? null}
          defaultDate={form.defaultDate ?? null}
          onClose={() => setForm({ open: false })}
          onSaved={() => {
            setForm({ open: false });
            agenda.reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Agenda Event"
          message={`Hapus agenda "${deleteTarget.title}"? Tindakan ini permanen.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

interface EventAgendaFormModalProps {
  agenda: EventAgenda | null;
  defaultDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function EventAgendaFormModal({
  agenda,
  defaultDate,
  onClose,
  onSaved,
}: EventAgendaFormModalProps) {
  const isEdit = Boolean(agenda);
  const today = toDateInputValue(new Date());

  const [title, setTitle] = useState(agenda?.title ?? "");
  const [description, setDescription] = useState(agenda?.description ?? "");
  const [startsOn, setStartsOn] = useState(
    agenda?.startsOn ?? defaultDate ?? today,
  );
  const [endsOn, setEndsOn] = useState(agenda?.endsOn ?? defaultDate ?? today);
  const [isActive, setIsActive] = useState(agenda?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setError("Judul event minimal 2 karakter.");
      return;
    }
    if (!startsOn) {
      setError("Tanggal mulai wajib diisi.");
      return;
    }
    if (endsOn && endsOn < startsOn) {
      setError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: trimmedTitle,
        description: description.trim() || null,
        startsOn,
        endsOn: endsOn || startsOn,
        isActive,
      };
      if (isEdit && agenda) {
        await apiPatch(`/admin/event-agenda/${agenda.id}`, payload);
      } else {
        await apiPost("/admin/event-agenda", payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal menyimpan agenda event",
      );
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Agenda Event" : "Tambah Agenda Event"}
      desc="Tandai tanggal penting seperti Ramadan, Lebaran, atau promo musiman."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={saving}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={primaryButtonClass}
            disabled={saving}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Judul Event *</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Contoh: Ramadan 2027, Promo Lebaran"
            maxLength={150}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Tanggal Mulai *</span>
            <input
              type="date"
              value={startsOn}
              onChange={(event) => {
                const next = event.target.value;
                setStartsOn(next);
                if (!endsOn || endsOn < next) setEndsOn(next);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Tanggal Selesai</span>
            <input
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(event) => setEndsOn(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Deskripsi</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Catatan tambahan (opsional), misalnya detail promo atau jam acara."
            className={textareaClass}
          />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-coffee-linen px-4 py-3 dark:border-coffee-night-border">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-coffee-linen text-coffee-brown focus:ring-coffee-brown/30 dark:border-coffee-night-border"
          />
          <span className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
            Aktif — tampilkan agenda ini di kalender dan aplikasi pelanggan
          </span>
        </label>
      </div>
    </AppModal>
  );
}
