"use client";

import { Loader2, PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  api,
  apiErrorFrom,
  type ApiStockLocation,
  type ApiStockOpnameDetail,
  type ApiStockSnapshotItem,
} from "@/lib/api";
import { formatQuantity, todayKey } from "@/lib/format";

interface StockAdjustModalProps {
  target: ApiStockSnapshotItem | null;
  locations: ApiStockLocation[];
  defaultLocationId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function StockAdjustModal({
  target,
  locations,
  defaultLocationId,
  onClose,
  onSaved,
}: StockAdjustModalProps) {
  const [locationId, setLocationId] = useState(
    defaultLocationId || locations[0]?.id || "",
  );
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const systemQuantity = useMemo(() => {
    if (!target || !locationId) return 0;
    return (
      target.byLocation.find((row) => row.stockLocationId === locationId)
        ?.onHand ?? 0
    );
  }, [target, locationId]);

  // Terima koma desimal (format Indonesia) maupun titik.
  const normalizedCounted = counted.trim().replace(",", ".");
  const countedNumber =
    normalizedCounted === "" || Number.isNaN(Number(normalizedCounted))
      ? null
      : Number(normalizedCounted);
  const difference =
    countedNumber === null ? null : countedNumber - systemQuantity;
  const canSubmit =
    Boolean(target) &&
    Boolean(locationId) &&
    countedNumber !== null &&
    countedNumber >= 0 &&
    !submitting;

  async function handleSubmit() {
    if (!target || !canSubmit || countedNumber === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api<ApiStockOpnameDetail>("/admin/stock-opnames", {
        method: "POST",
        body: {
          stockLocationId: locationId,
          opnameDate: todayKey(),
          notes: notes.trim() || undefined,
          postNow: true,
          items: [
            {
              ingredientId: target.ingredientId,
              countedQuantity: countedNumber,
              notes: notes.trim() || undefined,
            },
          ],
        },
      });
      onSaved(
        `Stok asli ${target.name} disimpan: ${formatQuantity(
          countedNumber,
          target.baseUnit,
        )}.`,
      );
      onClose();
    } catch (err) {
      setError(apiErrorFrom(err, "Stok asli gagal disimpan"));
    } finally {
      setSubmitting(false);
    }
  }

  const differenceTone =
    difference === null || difference === 0
      ? "text-muted"
      : difference > 0
        ? "text-success"
        : "text-danger";
  const differenceLabel =
    difference === null
      ? "Isi stok fisik untuk melihat selisih"
      : difference === 0
        ? "Sesuai dengan stok sistem"
        : difference > 0
          ? `Surplus +${formatQuantity(difference, target?.baseUnit)}`
          : `Defisit ${formatQuantity(Math.abs(difference), target?.baseUnit)}`;

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="Input Stok Asli"
      subtitle={
        target
          ? `${target.name} · ${target.sku}`
          : "Catat hasil hitung fisik bahan"
      }
      size="md"
      footer={
        <Button
          className="w-full"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <PackageCheck size={16} />
          )}
          Simpan Stok Asli
        </Button>
      }
    >
      {error ? (
        <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line bg-milk/70 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
            Stok sistem saat ini
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight text-ink tabular">
            {formatQuantity(systemQuantity, target?.baseUnit)}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Angka ini berasal dari mutasi stok yang tercatat. Stok asli yang
            kamu masukkan akan menjadi saldo baru setelah posting.
          </p>
        </div>

        <Field label="Lokasi stok" required>
          <Select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Stok fisik asli"
          hint={`Masukkan hasil hitung fisik dalam satuan ${target?.baseUnit ?? "bahan"}.`}
          required
        >
          <Input
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            placeholder={String(systemQuantity)}
            autoFocus
          />
        </Field>

        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Selisih terhadap sistem
          </p>
          <p className={`mt-1 text-sm font-black ${differenceTone}`}>
            {differenceLabel}
          </p>
        </div>

        <Field
          label="Catatan"
          hint="Opsional, mis. alasan selisih atau kondisi bahan."
        >
          <TextArea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Contoh: susut saat penyimpanan / hitung ulang"
            maxLength={300}
          />
        </Field>
      </div>
    </Modal>
  );
}
