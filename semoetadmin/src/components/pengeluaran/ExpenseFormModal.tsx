"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import DatePicker from "@/components/form/date-picker";
import { EXPENSE_CATEGORIES } from "@/lib/labels";
import { fieldLabelClass, inputClass, primaryButtonClass, secondaryButtonClass, textareaClass } from "@/lib/ui";
import type { Expense } from "@/types/api";
import { useCallback, useState } from "react";

interface ExpenseFormModalProps {
  expense?: Expense;
  onClose: () => void;
  onSaved: () => void;
}

interface ExpenseFormState {
  category: string;
  name: string;
  amountIdr: string;
  note: string;
  expenseDate: string;
}

/** Form tambah/ubah pengeluaran operasional. */
export default function ExpenseFormModal({ expense, onClose, onSaved }: ExpenseFormModalProps) {
  const editing = Boolean(expense);
  const [form, setForm] = useState<ExpenseFormState>({
    category: expense?.category ?? "bahan_baku",
    name: expense?.name ?? "",
    amountIdr: expense ? String(expense.amountIdr) : "",
    note: expense?.note ?? "",
    expenseDate: expense?.expenseDate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Stabil supaya flatpickr tidak di-init ulang setiap kali form berubah.
  const handleDateChange = useCallback((_selectedDates: Date[], dateStr: string) => {
    setForm((prev) => ({ ...prev, expenseDate: dateStr ?? "" }));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.name || form.name.trim().length < 2) {
      setError("Nama pengeluaran minimal 2 karakter.");
      return;
    }
    if (!form.category) {
      setError("Kategori pengeluaran wajib dipilih.");
      return;
    }

    const amount = Number(form.amountIdr);
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Nominal pengeluaran harus lebih besar dari 0.");
      return;
    }
    if (!form.expenseDate) {
      setError("Tanggal pengeluaran wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category: form.category,
        name: form.name.trim(),
        amountIdr: amount,
        note: form.note.trim() || null,
        expenseDate: form.expenseDate,
      };

      if (editing) {
        await apiPatch(`/admin/expenses/${expense!.id}`, payload);
      } else {
        await apiPost("/admin/expenses", payload);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengeluaran");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={editing ? "Ubah Pengeluaran" : "Tambah Pengeluaran"}
      desc="Catatan pengeluaran operasional cabang: sewa, utilitas, gaji, bahan baku, alat masak, pemasaran, dan lainnya."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="expense-form"
            className={primaryButtonClass}
            disabled={saving}
          >
            {saving ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Tambah Pengeluaran"}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Nama Pengeluaran *</span>
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="mis. Sewa Ruang Tunggu Bulan November"
              className={inputClass}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Kategori *</span>
            <select
              value={form.category}
              onChange={(event) => setField("category", event.target.value)}
              className={inputClass}
              required
            >
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Nominal (Rp) *</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.amountIdr}
              onChange={(event) => setField("amountIdr", event.target.value)}
              placeholder="0"
              className={inputClass}
              required
            />
          </label>
          <DatePicker
            id="expense-date"
            label="Tanggal *"
            defaultDate={form.expenseDate || undefined}
            placeholder="Pilih tanggal"
            onChange={handleDateChange}
          />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Keterangan</span>
            <textarea
              value={form.note}
              onChange={(event) => setField("note", event.target.value)}
              placeholder="Catatan tambahan, mis. nomor invoice / keterangan pembelian"
              className={textareaClass}
              rows={3}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-coffee-danger">{error}</p> : null}
      </form>
    </AppModal>
  );
}
