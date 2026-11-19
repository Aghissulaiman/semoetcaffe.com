"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataTable, { type Column } from "@/components/common/DataTable";
import { EmptyBlock, ErrorBlock } from "@/components/common/DataState";
import DateRangePicker from "@/components/common/DateRangePicker";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ToneBadge from "@/components/common/ToneBadge";
import DepositPaidDialog from "@/components/reservasi/DepositPaidDialog";
import { apiDelete } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import {
  DEPOSIT_STAGE_SHORT,
  type DepositStageKey,
  isFinalStatus,
  paidAmount,
} from "@/lib/deposit";
import { formatDateTime, formatIdr } from "@/lib/format";
import { depositStatusLabel, type StatusTone } from "@/lib/labels";
import type { AdminReservation } from "@/types/api";
import { GroupIcon, ListIcon, MailIcon, TimeIcon, TrashBinIcon } from "@/icons";

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "requested", label: "Diajukan" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "seated", label: "Sudah Duduk" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "no_show", label: "No Show" },
];

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  requested: "Diajukan",
  confirmed: "Dikonfirmasi",
  seated: "Sudah Duduk",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  no_show: "No Show",
};

const RESERVATION_STATUS_TONE: Record<string, StatusTone> = {
  requested: "warning",
  confirmed: "coffee",
  seated: "success",
  completed: "success",
  cancelled: "danger",
  no_show: "danger",
};

const RESERVATION_COLUMNS: CsvColumn<AdminReservation>[] = [
  { header: "Nomor", value: (r) => r.reservationNumber },
  { header: "Cabang", value: (r) => r.branchName ?? "" },
  { header: "Ruangan", value: (r) => roomsLabel(r) },
  { header: "Tanggal", value: (r) => (r.reservedFor ? formatDateTime(r.reservedFor) : "") },
  { header: "Selesai", value: (r) => (r.endsAt ? formatDateTime(r.endsAt) : "") },
  { header: "Durasi (menit)", value: (r) => r.durationMinutes },
  { header: "Tamu", value: (r) => r.guestCount },
  { header: "Status", value: (r) => RESERVATION_STATUS_LABEL[r.status] ?? r.status },
  { header: "Pelanggan", value: (r) => r.userName ?? "" },
  { header: "Email", value: (r) => r.userEmail ?? "" },
  { header: "Telepon", value: (r) => r.userPhone ?? "" },
  { header: "Sewa Ruangan (Rp)", value: (r) => r.roomTotalIdr ?? "" },
  { header: "Order Menu (Rp)", value: (r) => r.menuTotalIdr ?? "" },
  { header: "Total Bayar (Sewa + Menu) (Rp)", value: (r) => r.totalEstimateIdr ?? "" },
  { header: "DP1 (Rp)", value: (r) => r.depositAmountIdr ?? "" },
  { header: "DP2 (Rp)", value: (r) => r.deposit2AmountIdr ?? "" },
  { header: "Pelunasan (Rp)", value: (r) => r.settlementAmountIdr ?? "" },
  { header: "Sudah Dibayar (Rp)", value: (r) => paidAmount(r) },
  { header: "Sisa Tagihan (Rp)", value: (r) => Math.max(0, (r.totalEstimateIdr ?? 0) - paidAmount(r)) },
  { header: "DP1", value: (r) => depositStatusLabel(r.depositStatus) },
  { header: "DP2", value: (r) => depositStatusLabel(r.deposit2Status) },
  { header: "Pelunasan", value: (r) => depositStatusLabel(r.settlementStatus) },
  { header: "Catatan", value: (r) => r.specialRequests ?? "" },
  { header: "Dibuat", value: (r) => (r.createdAt ? formatDateTime(r.createdAt) : "") },
];

/** Satu titik tahap DP: warna mengikuti status. */
function DpDot({ status }: { status: string }) {
  const color =
    status === "paid"
      ? "bg-coffee-success"
      : status === "pending"
        ? "bg-coffee-warning"
        : "bg-coffee-linen dark:bg-coffee-night-border";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

/**
 * Ringkasan 3 tahap DP: titik status + label singkat. Tahap yang **sudah dibayar
 * pelanggan di aplikasi** dibuat bisa diklik — klik itu membuka pop-up
 * konfirmasi (verifikasi pembayaran).
 */
function DpCell({
  row,
  onOpenPaid,
}: {
  row: AdminReservation;
  onOpenPaid: (stage: DepositStageKey) => void;
}) {
  const stages: { key: DepositStageKey; label: string; status: string; proofUrl: string | null }[] = [
    { key: "deposit", label: "DP1", status: row.depositStatus, proofUrl: row.depositProofUrl },
    { key: "deposit2", label: "DP2", status: row.deposit2Status, proofUrl: row.deposit2ProofUrl },
    {
      key: "settlement",
      label: "LP",
      status: row.settlementStatus,
      proofUrl: row.settlementProofUrl,
    },
  ];
  const pending = stages.filter((s) => s.status === "pending");
  const withProof = stages.filter((s) => s.proofUrl);
  const clickable = !isFinalStatus(row.status);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {stages.map((s) =>
          s.status === "paid" && clickable ? (
            <button
              key={s.label}
              type="button"
              onClick={(event) => {
                // Jangan ikut memicu klik baris (yang membuka halaman detail).
                event.stopPropagation();
                onOpenPaid(s.key);
              }}
              title={`${DEPOSIT_STAGE_SHORT[s.key]} sudah dibayar di aplikasi — klik untuk mengonfirmasi`}
              className="inline-flex items-center gap-1 rounded-md border border-coffee-success/40 bg-coffee-success/10 px-1.5 py-0.5 text-theme-xs font-semibold text-coffee-success transition-colors hover:bg-coffee-success/20"
            >
              <DpDot status={s.status} /> {s.label}
            </button>
          ) : (
            <span key={s.label} className="flex items-center gap-1 text-theme-xs text-coffee-muted">
              <DpDot status={s.status} /> {s.label}
            </span>
          ),
        )}
      </div>
      {pending.length > 0 && (
        <span className="text-theme-xs font-medium text-coffee-warning">
          {pending.map((s) => s.label).join(", ")} sedang diproses
        </span>
      )}
      {withProof.length > 0 && (
        <span className="flex flex-wrap gap-2">
          {withProof.map((s) => (
            <a
              key={s.label}
              href={s.proofUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="text-theme-xs font-semibold text-coffee-brown hover:underline dark:text-coffee-caramel"
            >
              Bukti {s.label}
            </a>
          ))}
        </span>
      )}
      {clickable && stages.some((s) => s.status === "paid") && (
        <span className="text-theme-xs text-coffee-muted">Klik DP yang lunas untuk konfirmasi</span>
      )}
    </div>
  );
}

/** Kolom biaya ringkas: sewa ruangan, order menu, total, sudah dibayar, sisa. */
function CostCell({ row }: { row: AdminReservation }) {
  if (row.totalEstimateIdr == null) {
    return <span className="text-theme-xs text-coffee-muted">Belum dihitung</span>;
  }
  const paid = paidAmount(row);
  const remaining = Math.max(0, row.totalEstimateIdr - paid);
  const menuTotal = row.menuTotalIdr ?? 0;
  return (
    <div className="flex flex-col gap-0.5 text-theme-xs">
      <span className="font-semibold text-coffee-dark dark:text-coffee-cream/90">
        {formatIdr(row.totalEstimateIdr)}
      </span>
      <span className="text-coffee-muted">Sewa {formatIdr(row.roomTotalIdr ?? 0)}</span>
      {menuTotal > 0 && <span className="text-coffee-muted">Menu {formatIdr(menuTotal)}</span>}
      <span className="text-coffee-success">Dibayar {formatIdr(paid)}</span>
      <span className={remaining > 0 ? "text-coffee-danger" : "text-coffee-success"}>
        {remaining > 0 ? `Sisa ${formatIdr(remaining)}` : "Lunas"}
      </span>
    </div>
  );
}

/** Nama ruangan yang dipesan; jatuh ke kode meja lama bila reservasi lama. */
function roomsLabel(row: AdminReservation): string {
  if (row.rooms?.length) return row.rooms.map((room) => room.name).join(", ");
  if (row.tables?.length) return row.tables.join(", ");
  return "-";
}

export default function ReservasiPage() {
  const router = useRouter();
  const initial = useDateRange(30);
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  /** Reservasi + tahap DP yang dibayar di aplikasi dan menunggu konfirmasi. */
  const [paidTarget, setPaidTarget] = useState<{
    reservation: AdminReservation;
    stage: DepositStageKey;
  } | null>(null);
  /** Reservasi yang akan dihapus (menunggu konfirmasi dialog). */
  const [deleteTarget, setDeleteTarget] = useState<AdminReservation | null>(null);

  const from = fromOverride ?? initial?.from ?? "";
  const to = toOverride ?? initial?.to ?? "";
  /** Pengguna memilih "Semua tanggal" (override eksplisit menjadi kosong). */
  const allDates = fromOverride === "" && toOverride === "";
  const ready = allDates || Boolean(from && to);

  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) query.set("status", status);
  if (search) query.set("q", search);
  if (!allDates) {
    query.set("dateFrom", from);
    query.set("dateTo", to);
  }

  const reservations = useApi<AdminReservation[]>(
    ready ? `/admin/reservations?${query.toString()}` : null,
  );

  const loading = reservations.loading && !reservations.data;
  const items = reservations.data ?? [];

  const columns: Column<AdminReservation>[] = [
    { key: "reservationNumber", header: "Nomor", width: "140px" },
    { key: "branchName", header: "Cabang" },
    {
      key: "reservedFor",
      header: "Tanggal & Jam",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>{row.reservedFor ? formatDateTime(row.reservedFor) : "-"}</span>
          {row.endsAt && (
            <span className="flex items-center gap-1 text-theme-xs text-coffee-muted">
              <TimeIcon className="h-3 w-3" /> s/d {formatDateTime(row.endsAt)}
            </span>
          )}
        </div>
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
        <ToneBadge tone={RESERVATION_STATUS_TONE[row.status] ?? "muted"}>
          {RESERVATION_STATUS_LABEL[row.status] ?? row.status}
        </ToneBadge>
      ),
    },
    {
      key: "dp",
      header: "DP",
      width: "170px",
      render: (row) => (
        <DpCell
          row={row}
          onOpenPaid={(stage) => setPaidTarget({ reservation: row, stage })}
        />
      ),
    },
    {
      key: "cost",
      header: "Biaya",
      width: "170px",
      render: (row) => <CostCell row={row} />,
    },
    { key: "userName", header: "Pelanggan" },
    { key: "userPhone", header: "Telepon" },
    {
      key: "rooms",
      header: "Ruangan",
      render: (row) => {
        const label = roomsLabel(row);
        return label === "-" ? (
          <span className="text-theme-sm text-coffee-muted">-</span>
        ) : (
          <span className="flex items-center gap-1 text-theme-sm">
            <MailIcon className="h-3.5 w-3.5" />
            {label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Aksi",
      width: "120px",
      render: (row) => {
        if (!isDeletableStatus(row.status)) {
          return <span className="text-theme-xs text-coffee-muted">Tidak bisa dihapus</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={(e) => {
                // Jangan ikut membuka halaman detail lewat klik baris.
                e.stopPropagation();
                setDeleteTarget(row);
              }}
              className="inline-flex items-center gap-1 rounded-sm border border-coffee-danger/40 px-2 py-1 text-theme-xs text-coffee-danger hover:bg-coffee-danger/10 disabled:opacity-60"
              title="Hapus reservasi"
            >
              <TrashBinIcon className="h-3.5 w-3.5" /> Hapus
            </button>
          </div>
        );
      },
    },
  ];

  /** Baris tabel bisa diklik langsung (tanpa tombol "Kelola"). */
  const openDetail = (row: AdminReservation) => {
    router.push(`/reservasi/${row.id}`);
  };

  /** Status final yang boleh dihapus (cancelled, completed, no_show). */
  const isDeletableStatus = (status: string): boolean => {
    return status === "cancelled" || status === "completed" || status === "no_show";
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/reservations/${deleteTarget.id}`);
    setDeleteTarget(null);
    reservations.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadCrumb
        pageTitle="Reservasi"
        items={[{ label: "Dashboard", href: "/" }, { label: "Reservasi" }]}
      />

      <ComponentCard
        title="Kelola Reservasi"
        desc="Daftar seluruh reservasi ruangan pelanggan. Klik baris untuk membuka detail, klik DP yang lunas untuk mengonfirmasi pembayaran dari aplikasi."
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <DateRangePicker
            from={from}
            to={to}
            allowAll
            onChange={(nextFrom, nextTo) => {
              setFromOverride(nextFrom);
              setToOverride(nextTo);
              setPage(1);
            }}
          />
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-coffee-linen bg-white px-3 py-2 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:outline-none focus:ring-2 focus:ring-coffee-brown/20 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark">Cari</label>
            <div className="relative">
              <ListIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coffee-muted" />
              <input
                type="text"
                placeholder="Nomor, nama, email, telepon..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-coffee-linen bg-white py-2 pl-10 pr-3 text-theme-sm text-coffee-dark placeholder-coffee-muted focus:border-coffee-brown focus:outline-none focus:ring-2 focus:ring-coffee-brown/20 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:placeholder-coffee-muted dark:focus:border-coffee-caramel"
              />
            </div>
          </div>
          <ExportCsvButton
            filename={`reservasi-${from}-${to}.csv`}
            rows={items}
            columns={RESERVATION_COLUMNS}
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
        ) : reservations.error ? (
          <ErrorBlock message={reservations.error} onRetry={reservations.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock message="Tidak ada reservasi pada periode ini" />
        ) : (
          <>
            <DataTable columns={columns} data={items} onRowClick={openDetail} />
            {reservations.meta && reservations.meta.totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  page={page}
                  totalPages={reservations.meta.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </ComponentCard>

      {/* Pop-up konfirmasi DP yang sudah dibayar pelanggan di aplikasi. */}
      <DepositPaidDialog
        reservation={paidTarget?.reservation ?? null}
        stage={paidTarget?.stage ?? null}
        onClose={() => setPaidTarget(null)}
        onConfirmed={reservations.reload}
      />

      {/* Konfirmasi hapus reservasi (hanya status final: selesai/dibatalkan). */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Reservasi"
          message={`Yakin menghapus reservasi ${deleteTarget.reservationNumber} (${RESERVATION_STATUS_LABEL[deleteTarget.status] ?? deleteTarget.status})? Tindakan ini permanen dan riwayat pembayarannya ikut terhapus.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
