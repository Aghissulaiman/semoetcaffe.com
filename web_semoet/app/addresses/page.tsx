"use client";

/**
 * Alamat — daftar, tambah, hapus, dan atur alamat utama
 * (GET/POST/PATCH/DELETE /me/addresses). Dipakai checkout pengantaran.
 */
import { MapPin, PlusCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { TextField } from "@/components/ui/text-field";
import { apiErrorFrom } from "@/services/client";
import { createAddress, deleteAddress, listAddresses, setDefaultAddress } from "@/services/address.service";
import { useAuthStore } from "@/store/auth-store";

import type { Address } from "@/types/api";

interface FormState {
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  deliveryInstructions: string;
}

const EMPTY_FORM: FormState = {
  label: "",
  recipientName: "",
  recipientPhone: "",
  addressLine: "",
  city: "",
  province: "",
  postalCode: "",
  deliveryInstructions: "",
};

export default function AddressesPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = status === "authenticated";

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        setAddresses(await listAddresses());
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat alamat"));
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = () => {
    setForm({ ...EMPTY_FORM, recipientName: user?.displayName ?? "" });
    setFormErrors({});
    setShowForm(true);
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.label.trim()) errors.label = "Label wajib diisi";
    if (form.recipientName.trim().length < 2) errors.recipientName = "Nama penerima minimal 2 karakter";
    if (!/^\+?[0-9]{8,15}$/.test(form.recipientPhone.trim())) {
      errors.recipientPhone = "8–15 digit, boleh diawali +62";
    }
    if (form.addressLine.trim().length < 10) errors.addressLine = "Alamat minimal 10 karakter";
    if (form.city.trim().length < 2) errors.city = "Kota wajib diisi";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createAddress({
        label: form.label.trim(),
        recipientName: form.recipientName.trim(),
        recipientPhone: form.recipientPhone.trim(),
        addressLine: form.addressLine.trim(),
        city: form.city.trim(),
        province: form.province.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        deliveryInstructions: form.deliveryInstructions.trim() || undefined,
        isDefault: addresses.length === 0,
      });
      setShowForm(false);
      await load(false);
    } catch (err) {
      setFormErrors({ label: apiErrorFrom(err, "Gagal menyimpan alamat") });
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (id: string) => {
    try {
      await setDefaultAddress(id);
      await load(false);
    } catch (err) {
      setDialog({ title: "Gagal", message: apiErrorFrom(err) });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAddress(deleteTarget.id);
      setDeleteTarget(null);
      await load(false);
    } catch (err) {
      setDeleteTarget(null);
      setDialog({ title: "Gagal", message: apiErrorFrom(err) });
    } finally {
      setDeleting(false);
    }
  };

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (status === "loading") return <Loader label="Memuat alamat…" />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Alamat" onBack={() => router.back()} className="mb-4" />
        <EmptyState
          icon={MapPin}
          title="Masuk untuk mengelola alamat"
          description="Alamat tersimpan dipakai untuk pesanan antar."
          actionLabel="Masuk / Daftar"
          onAction={() => router.push("/auth/login")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <ScreenHeading
        title="Alamat"
        subtitle={`${addresses.length} alamat tersimpan`}
        onBack={() => router.back()}
        className="mb-4"
      />

      {loading ? (
        <Loader label="Memuat alamat…" />
      ) : error && addresses.length === 0 && !showForm ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {addresses.length === 0 && !showForm ? (
            <EmptyState
              icon={MapPin}
              title="Belum ada alamat"
              description="Tambahkan alamat untuk pesanan antar."
              actionLabel="Tambah Alamat"
              onAction={openForm}
            />
          ) : (
            addresses.map((address) => (
              <Card key={address.id}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[15px] font-extrabold text-ink">
                      {address.label}
                    </p>
                    {address.isDefault ? <Badge label="Utama" tone="success" size="sm" /> : null}
                  </div>
                  <p className="text-[13px] text-muted">
                    {address.recipientName} · {address.recipientPhone}
                  </p>
                  <p className="text-[13px] leading-[19px] text-muted">
                    {address.addressLine}
                    {address.addressDetail ? `, ${address.addressDetail}` : ""}
                  </p>
                  <p className="text-[13px] text-muted">
                    {address.city}
                    {address.province ? ` · ${address.province}` : ""}
                    {address.postalCode ? ` · ${address.postalCode}` : ""}
                  </p>
                  {address.deliveryInstructions ? (
                    <p className="text-xs italic text-muted">“{address.deliveryInstructions}”</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {address.isDefault ? null : (
                      <Button
                        title="Jadikan utama"
                        variant="soft"
                        size="sm"
                        fullWidth={false}
                        onClick={() => void makeDefault(address.id)}
                      />
                    )}
                    <Button
                      title="Hapus"
                      icon={Trash2}
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      onClick={() => setDeleteTarget(address)}
                    />
                  </div>
                </div>
              </Card>
            ))
          )}

          {showForm ? (
            <Card>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <PlusCircle size={18} className="text-primary" />
                  <p className="text-[15px] font-extrabold text-ink">Alamat baru</p>
                </div>
                <TextField
                  label="Label"
                  placeholder="Rumah, Kantor, Kos…"
                  value={form.label}
                  onChange={(event) => update("label", event.target.value)}
                  error={formErrors.label}
                  maxLength={120}
                />
                <TextField
                  label="Nama penerima"
                  value={form.recipientName}
                  onChange={(event) => update("recipientName", event.target.value)}
                  error={formErrors.recipientName}
                  maxLength={120}
                />
                <TextField
                  label="Nomor telepon"
                  placeholder="+628123456789"
                  inputMode="tel"
                  value={form.recipientPhone}
                  onChange={(event) => update("recipientPhone", event.target.value)}
                  error={formErrors.recipientPhone}
                  maxLength={20}
                />
                <TextField
                  label="Alamat lengkap"
                  placeholder="Jalan, nomor, RT/RW, kelurahan…"
                  multiline
                  rows={3}
                  value={form.addressLine}
                  onChange={(event) => update("addressLine", event.target.value)}
                  error={formErrors.addressLine}
                  maxLength={500}
                />
                <TextField
                  label="Kota"
                  placeholder="Bandung"
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  error={formErrors.city}
                  maxLength={120}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField
                    label="Provinsi (opsional)"
                    placeholder="Jawa Barat"
                    value={form.province}
                    onChange={(event) => update("province", event.target.value)}
                    maxLength={120}
                  />
                  <TextField
                    label="Kode pos (opsional)"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={(event) => update("postalCode", event.target.value)}
                    maxLength={10}
                  />
                </div>
                <TextField
                  label="Catatan kurir (opsional)"
                  placeholder="Contoh: titip di satpam"
                  multiline
                  rows={2}
                  value={form.deliveryInstructions}
                  onChange={(event) => update("deliveryInstructions", event.target.value)}
                  maxLength={500}
                />
                <div className="flex gap-2.5">
                  <Button
                    title="Batal"
                    variant="ghost"
                    onClick={() => setShowForm(false)}
                    className="flex-1"
                  />
                  <Button
                    title="Simpan"
                    loading={saving}
                    onClick={() => void submit()}
                    className="flex-1"
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Button title="Tambah Alamat" variant="soft" icon={PlusCircle} onClick={openForm} />
          )}
        </div>
      )}

      <AppDialog
        visible={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus alamat"
        message={deleteTarget ? `Hapus alamat "${deleteTarget.label}"?` : undefined}
        icon={Trash2}
        tone="danger"
        confirmLabel="Hapus"
        confirmVariant="danger"
        confirmLoading={deleting}
        onConfirm={() => void confirmDelete()}
        cancelLabel="Batal"
      />

      <AppDialog
        visible={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        icon={Trash2}
        tone="danger"
      />
    </div>
  );
}
