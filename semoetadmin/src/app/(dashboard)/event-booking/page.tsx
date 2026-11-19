"use client";

import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import AppModal from "@/components/common/AppModal";
import ComponentCard from "@/components/common/ComponentCard";
import DataTable, { type Column } from "@/components/common/DataTable";
import { EmptyBlock, ErrorBlock } from "@/components/common/DataState";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ToneBadge from "@/components/common/ToneBadge";
import EventAgendaManager from "@/components/event/EventAgendaManager";
import type { CsvColumn } from "@/lib/csv";
import { formatDateTime, formatIdr } from "@/lib/format";
import { cn } from "@/utils";
import type { StatusTone } from "@/lib/labels";
import type {
  AdminEventBooking,
  AdminEventBookingAddon,
  AdminEventBookingCatering,
} from "@/types/api";
import { GroupIcon, ListIcon, PageIcon, PlusIcon } from "@/icons";

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "requested", label: "Diajukan" },
  { value: "quoted", label: "Dikutip" },
  { value: "awaiting_deposit", label: "Menunggu DP" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "in_progress", label: "Sedang Berjalan" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

const EVENT_BOOKING_STATUS_LABEL: Record<string, string> = {
  requested: "Diajukan",
  quoted: "Dikutip",
  awaiting_deposit: "Menunggu DP",
  confirmed: "Dikonfirmasi",
  in_progress: "Sedang Berjalan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const EVENT_BOOKING_STATUS_TONE: Record<string, StatusTone> = {
  requested: "warning",
  quoted: "coffee",
  awaiting_deposit: "warning",
  confirmed: "success",
  in_progress: "coffee",
  completed: "success",
  cancelled: "danger",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  birthday: "Ulang Tahun",
  arisan: "Arisan",
  meeting: "Meeting",
  gathering: "Kumpul-kumpul",
  engagement: "Lamaran",
  wedding: "Pernikahan",
  seminar: "Seminar",
  reunion: "Reuni",
  bukber: "Buka Bersama",
  family_gathering: "Kumpul Keluarga",
  other: "Lainnya",
};

const EVENT_BOOKING_COLUMNS: CsvColumn<AdminEventBooking>[] = [
  { header: "Nomor", value: (r) => r.bookingNumber },
  { header: "Cabang", value: (r) => r.branchName ?? "" },
  {
    header: "Tanggal",
    value: (r) => (r.startsAt ? formatDateTime(r.startsAt) : ""),
  },
  {
    header: "Jenis Event",
    value: (r) => EVENT_TYPE_LABEL[r.eventType] ?? r.eventType,
  },
  { header: "Tamu", value: (r) => r.guestCount },
  {
    header: "Status",
    value: (r) => EVENT_BOOKING_STATUS_LABEL[r.status] ?? r.status,
  },
  { header: "Total (Rp)", value: (r) => r.subtotalIdr },
  { header: "DP (Rp)", value: (r) => r.depositIdr },
  { header: "Dibayar (Rp)", value: (r) => r.paidIdr },
  { header: "Pelanggan", value: (r) => r.userName ?? "" },
  { header: "Email", value: (r) => r.userEmail ?? "" },
  { header: "Telepon", value: (r) => r.userPhone ?? "" },
  { header: "Catatan", value: (r) => r.customRequests ?? "" },
  {
    header: "Dibuat",
    value: (r) => (r.createdAt ? formatDateTime(r.createdAt) : ""),
  },
];

export default function EventBookingPage() {
  const initial = useDateRange(30);
  const [tab, setTab] = useState<"booking" | "agenda">("booking");
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState<AdminEventBooking | null>(null);

  const from = fromOverride ?? initial?.from ?? "";
  const to = toOverride ?? initial?.to ?? "";
  const ready = Boolean(from && to);

  const bookings = useApi<AdminEventBooking[]>(
    ready
      ? `/admin/event-bookings?page=${page}&limit=20${status ? `&status=${status}` : ""}&dateFrom=${from}&dateTo=${to}${
          search ? `&q=${encodeURIComponent(search)}` : ""
        }`
      : null,
  );

  const loading = bookings.loading && !bookings.data;
  const items = bookings.data ?? [];

  const columns: Column<AdminEventBooking>[] = [
    { key: "bookingNumber", header: "Nomor", width: "140px" },
    { key: "branchName", header: "Cabang" },
    {
      key: "startsAt",
      header: "Tanggal Event",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>{row.startsAt ? formatDateTime(row.startsAt) : "-"}</span>
          {row.endsAt && (
            <span className="text-theme-xs text-coffee-muted">
              s.d. {formatDateTime(row.endsAt)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "eventType",
      header: "Jenis Event",
      width: "140px",
      render: (row) => (
        <ToneBadge tone="coffee">
          {EVENT_TYPE_LABEL[row.eventType] ?? row.eventType}
        </ToneBadge>
      ),
    },
    {
      key: "guestCount",
      header: "Tamu",
      align: "center",
      width: "80px",
      render: (row) => (
        <span className="flex items-center gap-1">
          <GroupIcon className="h-3.5 w-3.5" /> {row.guestCount}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "130px",
      render: (row) => (
        <ToneBadge tone={EVENT_BOOKING_STATUS_TONE[row.status] ?? "muted"}>
          {EVENT_BOOKING_STATUS_LABEL[row.status] ?? row.status}
        </ToneBadge>
      ),
    },
    {
      key: "pricing",
      header: "Harga / DP / Dibayar",
      width: "180px",
      render: (row) => (
        <div className="flex flex-col gap-1 text-theme-sm">
          <span>
            Total:{" "}
            <span className="font-semibold">{formatIdr(row.subtotalIdr)}</span>
          </span>
          <span>
            DP:{" "}
            <span className="font-semibold">{formatIdr(row.depositIdr)}</span>
          </span>
          <span>
            Dibayar:{" "}
            <span className="font-semibold text-coffee-success">
              {formatIdr(row.paidIdr)}
            </span>
          </span>
        </div>
      ),
    },
    { key: "userName", header: "Pelanggan" },
    {
      key: "actions",
      header: "Aksi",
      width: "100px",
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDetailOpen(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-linen bg-white px-3 py-1.5 text-theme-sm font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:hover:bg-white/5"
          >
            Detail
          </button>
        </div>
      ),
    },
  ];

  if (detailOpen) {
    return (
      <AppModal
        isOpen
        onClose={() => setDetailOpen(null)}
        title={`Detail Booking: ${detailOpen.bookingNumber}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-theme-sm text-coffee-muted">Nomor Booking</p>
              <p className="font-mono font-semibold">
                {detailOpen.bookingNumber}
              </p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Status</p>
              <ToneBadge
                tone={EVENT_BOOKING_STATUS_TONE[detailOpen.status] ?? "muted"}
              >
                {EVENT_BOOKING_STATUS_LABEL[detailOpen.status] ??
                  detailOpen.status}
              </ToneBadge>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Cabang</p>
              <p>{detailOpen.branchName ?? "-"}</p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Jenis Event</p>
              <p>
                {EVENT_TYPE_LABEL[detailOpen.eventType] ?? detailOpen.eventType}
              </p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Tanggal Mulai</p>
              <p>
                {detailOpen.startsAt
                  ? formatDateTime(detailOpen.startsAt)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Tanggal Selesai</p>
              <p>
                {detailOpen.endsAt ? formatDateTime(detailOpen.endsAt) : "-"}
              </p>
            </div>
            <div>
              <p className="text-theme-sm text-coffee-muted">Jumlah Tamu</p>
              <p>{detailOpen.guestCount}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-theme-sm text-coffee-muted">Nama Event</p>
              <p>{detailOpen.eventName ?? "-"}</p>
            </div>
          </div>

          <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
            <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">
              Paket Event
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-theme-sm text-coffee-muted">Paket</p>
                <p className="font-medium">
                  {detailOpen.eventPackageName ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Harga Paket</p>
                <p className="font-medium">
                  {formatIdr(detailOpen.eventPackagePriceIdr)}
                </p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Subtotal</p>
                <p className="font-medium">
                  {formatIdr(detailOpen.subtotalIdr)}
                </p>
              </div>
            </div>
          </div>

          {detailOpen.catering.length > 0 && (
            <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
              <h4 className="mb-3 flex items-center gap-2 font-semibold text-coffee-espresso dark:text-coffee-cream">
                <PageIcon className="h-5 w-5" /> Catering
              </h4>
              <DataTable<AdminEventBookingCatering>
                columns={[
                  { key: "packageName", header: "Paket" },
                  {
                    key: "pricePerPersonIdr",
                    header: "Harga/Orang",
                    align: "right",
                    render: (r) => formatIdr(r.pricePerPersonIdr),
                  },
                  { key: "guestCount", header: "Tamu", align: "center" },
                  {
                    key: "lineTotalIdr",
                    header: "Total",
                    align: "right",
                    render: (r) => formatIdr(r.lineTotalIdr),
                  },
                ]}
                data={detailOpen.catering}
              />
            </div>
          )}

          {detailOpen.addons.length > 0 && (
            <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
              <h4 className="mb-3 flex items-center gap-2 font-semibold text-coffee-espresso dark:text-coffee-cream">
                <PlusIcon className="h-5 w-5" /> Add-on
              </h4>
              <DataTable<AdminEventBookingAddon>
                columns={[
                  { key: "name", header: "Nama" },
                  { key: "quantity", header: "Qty", align: "center" },
                  {
                    key: "unitPriceIdr",
                    header: "Harga Satuan",
                    align: "right",
                    render: (r) => formatIdr(r.unitPriceIdr),
                  },
                  {
                    key: "lineTotalIdr",
                    header: "Total",
                    align: "right",
                    render: (r) => formatIdr(r.lineTotalIdr),
                  },
                ]}
                data={detailOpen.addons}
              />
            </div>
          )}

          <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
            <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">
              Ringkasan Pembayaran
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-theme-sm text-coffee-muted">Subtotal</p>
                <p className="font-semibold">
                  {formatIdr(detailOpen.subtotalIdr)}
                </p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">DP Dibutuhkan</p>
                <p className="font-semibold">
                  {formatIdr(detailOpen.depositIdr)}
                </p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Sudah Dibayar</p>
                <p className="font-semibold text-coffee-success">
                  {formatIdr(detailOpen.paidIdr)}
                </p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Sisa</p>
                <p className="font-semibold text-coffee-warning">
                  {formatIdr(
                    Math.max(0, detailOpen.subtotalIdr - detailOpen.paidIdr),
                  )}
                </p>
              </div>
            </div>
          </div>

          {detailOpen.customRequests && (
            <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
              <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">
                Catatan Khusus
              </h4>
              <p className="whitespace-pre-wrap text-coffee-muted">
                {detailOpen.customRequests}
              </p>
            </div>
          )}

          <div className="border-t border-coffee-linen pt-6 dark:border-coffee-night-border">
            <h4 className="mb-3 font-semibold text-coffee-espresso dark:text-coffee-cream">
              Pelanggan
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-theme-sm text-coffee-muted">Nama</p>
                <p>{detailOpen.userName ?? "-"}</p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Email</p>
                <p>{detailOpen.userEmail ?? "-"}</p>
              </div>
              <div>
                <p className="text-theme-sm text-coffee-muted">Telepon</p>
                <p>{detailOpen.userPhone ?? "-"}</p>
              </div>
            </div>
          </div>
        </div>
      </AppModal>
    );
  }

  return (
    <div className="space-y-6">
      <PageBreadCrumb
        pageTitle="Booking Event"
        items={[{ label: "Dashboard", href: "/" }, { label: "Booking Event" }]}
      />

      <div className="flex w-full max-w-md gap-1 rounded-lg border border-coffee-linen p-0.5 dark:border-coffee-night-border">
        {[
          { key: "booking" as const, label: "Booking" },
          { key: "agenda" as const, label: "Agenda Event" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-theme-xs font-semibold transition-colors",
              tab === item.key
                ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                : "text-coffee-muted hover:text-coffee-brown",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "agenda" && <EventAgendaManager />}

      {tab === "booking" && (
        <ComponentCard
          title="Kelola Booking Event"
          desc="Daftar seluruh booking paket event & katering"
        >
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <DateRangePicker
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) => {
                setFromOverride(nextFrom);
                setToOverride(nextTo);
                setPage(1);
              }}
            />
            <div className="min-w-[200px] flex-1">
              <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-coffee-linen bg-white px-3 py-2 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20 focus:outline-none dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">
                Cari
              </label>
              <div className="relative">
                <ListIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-coffee-muted" />
                <input
                  type="text"
                  placeholder="Nomor, nama event, pelanggan..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-coffee-linen bg-white py-2 pr-3 pl-10 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20 focus:outline-none dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
                />
              </div>
            </div>
            <ExportCsvButton
              filename={`event-booking-${from}-${to}.csv`}
              rows={items}
              columns={EVENT_BOOKING_COLUMNS}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg bg-coffee-linen/50 dark:bg-coffee-night-border/50"
                />
              ))}
            </div>
          ) : bookings.error ? (
            <ErrorBlock message={bookings.error} onRetry={bookings.reload} />
          ) : items.length === 0 ? (
            <EmptyBlock message="Tidak ada booking event pada periode ini" />
          ) : (
            <>
              <DataTable columns={columns} data={items} />
              {bookings.meta && bookings.meta.totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                  <Pagination
                    page={page}
                    totalPages={bookings.meta.totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </ComponentCard>
      )}
    </div>
  );
}
