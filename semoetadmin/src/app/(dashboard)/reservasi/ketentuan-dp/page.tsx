"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { ErrorBlock, LoadingBlock } from "@/components/common/DataState";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPatch } from "@/lib/client";
import { DEFAULT_DEPOSIT_TERMS, depositStages, type DepositTerms } from "@/lib/deposit";
import { formatDateTime, formatIdr } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/ui";
import type { DepositSettings } from "@/types/api";
import { useEffect, useMemo, useState } from "react";

type FormState = {
  dp1Percent: string;
  dp1MinIdr: string;
  dp1MaxIdr: string;
  dp2Percent: string;
};

const DEFAULT_FORM: FormState = {
  dp1Percent: String(DEFAULT_DEPOSIT_TERMS.dp1Percent),
  dp1MinIdr: String(DEFAULT_DEPOSIT_TERMS.dp1MinIdr),
  dp1MaxIdr: String(DEFAULT_DEPOSIT_TERMS.dp1MaxIdr),
  dp2Percent: String(DEFAULT_DEPOSIT_TERMS.dp2Percent),
};

/**
 * Pengaturan ketentuan DP reservasi: persentase DP1 (dengan batas nominal
 * minimum/maksimum) dan persentase DP2 (dari sisa setelah DP1). Pelunasan
 * selalu otomatis = sisa setelah DP1 & DP2.
 *
 * Perubahan hanya dipakai untuk reservasi baru; nominal pada reservasi lama
 * tetap memakai nilai yang sudah tersimpan.
 */
export default function KetentuanDpPage() {
  const settings = useApi<DepositSettings>("/admin/reservation-settings");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [sampleTotal, setSampleTotal] = useState("1000000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      dp1Percent: String(settings.data.dp1Percent),
      dp1MinIdr: String(settings.data.dp1MinIdr),
      dp1MaxIdr: String(settings.data.dp1MaxIdr),
      dp2Percent: String(settings.data.dp2Percent),
    });
  }, [settings.data]);

  /** Validasi input form; `null` berarti ada yang belum benar. */
  const parsed = useMemo<DepositTerms | null>(() => {
    const dp1Percent = Number(form.dp1Percent);
    const dp1MinIdr = Number(form.dp1MinIdr);
    const dp1MaxIdr = Number(form.dp1MaxIdr);
    const dp2Percent = Number(form.dp2Percent);
    if (
      form.dp1Percent.trim() === "" ||
      form.dp1MinIdr.trim() === "" ||
      form.dp1MaxIdr.trim() === "" ||
      form.dp2Percent.trim() === ""
    ) {
      return null;
    }
    if (
      !Number.isFinite(dp1Percent) ||
      !Number.isFinite(dp1MinIdr) ||
      !Number.isFinite(dp1MaxIdr) ||
      !Number.isFinite(dp2Percent)
    ) {
      return null;
    }
    if (dp1Percent < 0 || dp1Percent > 100 || dp2Percent < 0 || dp2Percent > 100) {
      return null;
    }
    if (!Number.isInteger(dp1MinIdr) || !Number.isInteger(dp1MaxIdr)) return null;
    if (dp1MinIdr < 0 || dp1MaxIdr < 0 || dp1MinIdr > dp1MaxIdr) return null;
    return { dp1Percent, dp1MinIdr, dp1MaxIdr, dp2Percent };
  }, [form]);

  const validationMessage = useMemo(() => {
    if (parsed) return null;
    const dp1Min = Number(form.dp1MinIdr);
    const dp1Max = Number(form.dp1MaxIdr);
    if (Number.isFinite(dp1Min) && Number.isFinite(dp1Max) && dp1Min > dp1Max) {
      return "Batas minimum DP1 tidak boleh lebih besar dari batas maksimum.";
    }
    return "Lengkapi semua kolom. Persentase 0–100, nominal berupa angka bulat dan tidak negatif.";
  }, [form, parsed]);

  const sample = depositStages(
    Math.max(0, Math.round(Number(sampleTotal) || 0)),
    parsed ?? DEFAULT_DEPOSIT_TERMS,
  );

  const handleSave = async () => {
    if (!parsed) {
      setError(validationMessage);
      setSaved(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const envelope = await apiPatch<DepositSettings>("/admin/reservation-settings", parsed);
      setSaved(
        `Ketentuan DP berhasil disimpan${
          envelope.data.updatedAt ? ` pada ${formatDateTime(envelope.data.updatedAt)}` : ""
        }.`,
      );
      settings.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan ketentuan DP");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setForm(DEFAULT_FORM);
    setError(null);
    setSaved(null);
  };

  return (
    <div className="space-y-6">
      <PageBreadCrumb
        pageTitle="Ketentuan DP"
        items={[{ label: "Reservasi", href: "/reservasi" }, { label: "Ketentuan DP" }]}
      />

      <ComponentCard
        title="Ketentuan DP Reservasi"
        desc="Atur pembagian uang muka (DP1 & DP2) dan pelunasan. Nominal dihitung otomatis dari total reservasi (sewa ruangan + order menu)."
      >
        {settings.loading && !settings.data ? (
          <LoadingBlock message="Memuat ketentuan DP…" />
        ) : settings.error && !settings.data ? (
          <ErrorBlock message={settings.error} onRetry={settings.reload} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* DP1 */}
              <div className="rounded-xl border border-coffee-linen p-5 dark:border-coffee-night-border">
                <h3 className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                  DP1 · Uang Muka Awal
                </h3>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  Persentase dari total, dijepit di antara batas minimum dan maksimum.
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className={fieldLabelClass}>Persentase DP1 (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={form.dp1Percent}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, dp1Percent: event.target.value }))
                      }
                      className={`${inputClass} mt-1.5 w-full`}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Batas minimum (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={form.dp1MinIdr}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, dp1MinIdr: event.target.value }))
                      }
                      className={`${inputClass} mt-1.5 w-full`}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Batas maksimum (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={form.dp1MaxIdr}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, dp1MaxIdr: event.target.value }))
                      }
                      className={`${inputClass} mt-1.5 w-full`}
                    />
                  </div>
                </div>
              </div>

              {/* DP2 */}
              <div className="rounded-xl border border-coffee-linen p-5 dark:border-coffee-night-border">
                <h3 className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                  DP2 · Setelah Konfirmasi
                </h3>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  Persentase dari sisa tagihan setelah DP1 dibayar.
                </p>
                <div className="mt-4">
                  <label className={fieldLabelClass}>Persentase DP2 (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.dp2Percent}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, dp2Percent: event.target.value }))
                    }
                    className={`${inputClass} mt-1.5 w-full`}
                  />
                </div>
              </div>

              {/* Pelunasan */}
              <div className="rounded-xl border border-coffee-linen bg-coffee-milk/40 p-5 dark:border-coffee-night-border dark:bg-white/5">
                <h3 className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                  Pelunasan
                </h3>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  Otomatis, tidak perlu diatur.
                </p>
                <p className="mt-4 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                  Pelunasan = sisa total setelah DP1 dan DP2 dibayar. Nominalnya mengikuti
                  total reservasi masing-masing pelanggan.
                </p>
              </div>
            </div>

            {/* Simulasi */}
            <div className="rounded-xl border border-coffee-linen p-5 dark:border-coffee-night-border">
              <h3 className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                Simulasi Perhitungan
              </h3>
              <p className="mt-1 text-theme-xs text-coffee-muted">
                Cek hasil rumus sebelum menyimpan. Total = sewa ruangan + order menu.
              </p>
              <div className="mt-4 max-w-xs">
                <label className={fieldLabelClass}>Total reservasi (Rp)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={sampleTotal}
                  onChange={(event) => setSampleTotal(event.target.value)}
                  className={`${inputClass} mt-1.5 w-full`}
                />
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewRow label="Total" value={formatIdr(sample.total)} />
                <PreviewRow label="DP1" value={formatIdr(sample.deposit1)} />
                <PreviewRow label="DP2" value={formatIdr(sample.deposit2)} />
                <PreviewRow label="Pelunasan" value={formatIdr(sample.settlement)} />
              </dl>
            </div>

            {validationMessage && (
              <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
                {validationMessage}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
                {error}
              </p>
            )}
            {saved && (
              <p className="rounded-lg border border-coffee-success/30 bg-coffee-success/5 px-4 py-3 text-theme-sm text-coffee-success">
                {saved}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-coffee-linen pt-5 dark:border-coffee-night-border">
              <p className="max-w-xl text-theme-xs text-coffee-muted">
                Perubahan hanya berlaku untuk reservasi baru. Reservasi yang sudah ada tetap
                memakai nominal DP yang tersimpan.
                {settings.data?.updatedAt
                  ? ` Terakhir diubah ${formatDateTime(settings.data.updatedAt)}.`
                  : ""}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={resetToDefault} className={secondaryButtonClass}>
                  Kembalikan Default
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !parsed}
                  className={primaryButtonClass}
                >
                  {saving ? "Menyimpan…" : "Simpan Ketentuan"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-coffee-milk/50 px-4 py-3 dark:bg-white/5">
      <dt className="text-theme-xs text-coffee-muted">{label}</dt>
      <dd className="mt-1 text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
        {value}
      </dd>
    </div>
  );
}
