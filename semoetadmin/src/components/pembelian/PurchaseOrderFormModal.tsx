"use client";

import AppModal from "@/components/common/AppModal";
import IngredientPicker from "@/components/common/IngredientPicker";
import DatePicker from "@/components/form/date-picker";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { formatIdr, toDateInputValue } from "@/lib/format";
import {
  dangerButtonClass,
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type {
  Branch,
  Ingredient,
  PurchaseOrderDetail,
} from "@/types/api";
import { useMemo, useState } from "react";

interface PurchaseOrderFormModalProps {
  detail?: PurchaseOrderDetail;
  onClose: () => void;
  onSaved: () => void;
}

interface ItemRow {
  key: string;
  ingredientId: string;
  quantity: string;
  unitPriceIdr: string;
}

function newRow(): ItemRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ingredientId: "",
    quantity: "1",
    unitPriceIdr: "0",
  };
}

/** Form pembuatan / perubahan purchase order beserta rincian bahan. */
export default function PurchaseOrderFormModal({
  detail,
  onClose,
  onSaved,
}: PurchaseOrderFormModalProps) {
  const editing = Boolean(detail);
  const ingredients = useApi<Ingredient[]>("/admin/ingredients?limit=100&isActive=true");
  const branches = useApi<Branch[]>("/branches?limit=50");

  const [supplierId, setSupplierId] = useState(detail?.order.supplierId ?? "");
  const [branchId, setBranchId] = useState(detail?.order.branchId ?? "");
  const [status, setStatus] = useState(detail?.order.status === "ordered" ? "ordered" : "draft");
  const [orderDate, setOrderDate] = useState(() =>
    toDateInputValue(detail?.order.orderDate ? new Date(detail.order.orderDate) : new Date()),
  );
  const [expectedDate, setExpectedDate] = useState(() =>
    detail?.order.expectedDate ? toDateInputValue(new Date(detail.order.expectedDate)) : "",
  );
  const [dueDate, setDueDate] = useState(() =>
    detail?.order.dueDate ? toDateInputValue(new Date(detail.order.dueDate)) : "",
  );
  const [discountIdr, setDiscountIdr] = useState(String(detail?.order.discountIdr ?? 0));
  const [taxIdr, setTaxIdr] = useState(String(detail?.order.taxIdr ?? 0));
  const [notes, setNotes] = useState(detail?.order.notes ?? "");
  const [items, setItems] = useState<ItemRow[]>(() =>
    detail && detail.items.length > 0
      ? detail.items.map((item) => ({
          key: item.id,
          ingredientId: item.ingredientId,
          quantity: String(item.quantity),
          unitPriceIdr: String(item.unitPriceIdr),
        }))
      : [newRow()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplierOptions = useApi<{ id: string; name: string; code: string; isActive: boolean }[]>(
    "/admin/suppliers?limit=100",
  );

  const ingredientList = ingredients.data ?? [];
  const usedIngredientIds = useMemo(
    () => new Set(items.map((item) => item.ingredientId).filter(Boolean)),
    [items],
  );

  const subtotalIdr = useMemo(
    () =>
      items.reduce((total, item) => {
        const qty = Number(item.quantity);
        const price = Number(item.unitPriceIdr);
        if (!Number.isFinite(qty) || !Number.isFinite(price)) return total;
        return total + Math.round(qty * price);
      }, 0),
    [items],
  );
  const discount = Number(discountIdr) || 0;
  const tax = Number(taxIdr) || 0;
  const totalIdr = Math.max(subtotalIdr - discount + tax, 0);

  const updateItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!supplierId) return setError("Pilih supplier terlebih dahulu.");
    const payloadItems = items
      .filter((item) => item.ingredientId)
      .map((item) => ({
        ingredientId: item.ingredientId,
        quantity: Number(item.quantity),
        unitPriceIdr: Math.round(Number(item.unitPriceIdr) || 0),
      }));

    if (payloadItems.length === 0) {
      return setError("Tambahkan minimal satu bahan pada purchase order.");
    }
    if (payloadItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return setError("Kuantitas setiap bahan harus lebih dari 0.");
    }

    const payload = {
      supplierId,
      branchId: branchId || undefined,
      status,
      orderDate: orderDate || undefined,
      expectedDate: expectedDate || undefined,
      dueDate: dueDate || undefined,
      discountIdr: Math.round(discount),
      taxIdr: Math.round(tax),
      notes: notes.trim() || undefined,
      items: payloadItems,
    };

    setSaving(true);
    try {
      if (editing) {
        await apiPatch(`/admin/purchase-orders/${detail!.order.id}`, {
          ...payload,
          branchId: branchId || null,
          expectedDate: expectedDate || null,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        });
      } else {
        await apiPost("/admin/purchase-orders", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={editing ? "Ubah Purchase Order" : "Buat Purchase Order"}
      desc="PO diterbitkan ke supplier. Penerimaan barang dicatat terpisah agar stok masuk tervalidasi."
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="purchase-order-form"
            className={primaryButtonClass}
            disabled={saving}
          >
            {saving ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Simpan PO"}
          </button>
        </>
      }
    >
      <form id="purchase-order-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Supplier *</span>
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className={inputClass}
              required
            >
              <option value="">Pilih supplier</option>
              {(supplierOptions.data ?? [])
                .filter((supplier) => supplier.isActive || supplier.id === supplierId)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.code} · {supplier.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Cabang Tujuan</span>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className={inputClass}
            >
              <option value="">Tanpa cabang</option>
              {(branches.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <DatePicker
            id="po-order-date"
            label="Tanggal PO"
            value={orderDate}
            onChangeValue={setOrderDate}
            placeholder="YYYY-MM-DD"
          />
          <DatePicker
            id="po-expected-date"
            label="Perkiraan Datang"
            value={expectedDate}
            onChangeValue={setExpectedDate}
            placeholder="YYYY-MM-DD"
          />
          <DatePicker
            id="po-due-date"
            label="Jatuh Tempo"
            value={dueDate}
            onChangeValue={setDueDate}
            placeholder="YYYY-MM-DD"
          />
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Status Dokumen</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={inputClass}
            >
              <option value="draft">Draft (belum diterbitkan)</option>
              <option value="ordered">Diterbitkan ke supplier</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-coffee-linen p-4 dark:border-coffee-night-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                Rincian Bahan
              </p>
              <p className="text-theme-xs text-coffee-muted">
                Harga satuan menentukan nilai PO dan harga beli terakhir bahan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, newRow()])}
              className={secondaryButtonClass}
            >
              + Baris
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => {
              const ingredient = ingredientList.find((row) => row.id === item.ingredientId);
              const lineTotal = Math.round(
                (Number(item.quantity) || 0) * (Number(item.unitPriceIdr) || 0),
              );
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-1 items-end gap-3 rounded-lg bg-coffee-milk/40 p-3 sm:grid-cols-12 dark:bg-white/5"
                >
                  <div className="sm:col-span-6">
                    <label className="mb-1 block text-theme-xs font-medium text-coffee-muted">
                      Bahan #{index + 1}
                    </label>
                    <IngredientPicker
                      ingredients={ingredientList.filter(
                        (row) => row.id === item.ingredientId || !usedIngredientIds.has(row.id),
                      )}
                      value={item.ingredientId}
                      onChange={(ingredientId) => updateItem(item.key, { ingredientId })}
                    />
                  </div>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className={fieldLabelClass}>
                      Jumlah {ingredient ? `(${ingredient.baseUnit})` : ""}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                      className={`${inputClass} text-end`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className={fieldLabelClass}>Harga Satuan</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.unitPriceIdr}
                      onChange={(event) =>
                        updateItem(item.key, { unitPriceIdr: event.target.value })
                      }
                      className={`${inputClass} text-end`}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-theme-xs font-medium text-coffee-muted">Subtotal</p>
                    <p className="flex h-10 items-center justify-end text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                      {formatIdr(lineTotal)}
                    </p>
                  </div>
                  {items.length > 1 && (
                    <div className="sm:col-span-12">
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.filter((row) => row.key !== item.key))
                        }
                        className={`${dangerButtonClass} h-8 px-3 text-theme-xs`}
                      >
                        Hapus baris
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="flex flex-col gap-1">
              <span className={fieldLabelClass}>Diskon (Rp)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={discountIdr}
                onChange={(event) => setDiscountIdr(event.target.value)}
                className={`${inputClass} text-end`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={fieldLabelClass}>Pajak / Biaya Tambahan (Rp)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={taxIdr}
                onChange={(event) => setTaxIdr(event.target.value)}
                className={`${inputClass} text-end`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={fieldLabelClass}>Catatan</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Catatan untuk supplier atau tim gudang"
                className={textareaClass}
              />
            </label>
          </div>

          <div className="h-fit space-y-2 rounded-xl border border-coffee-linen bg-coffee-milk/40 p-4 dark:border-coffee-night-border dark:bg-white/5">
            <div className="flex justify-between text-theme-sm">
              <span className="text-coffee-muted">Subtotal</span>
              <span className="font-medium text-coffee-dark dark:text-coffee-cream">
                {formatIdr(subtotalIdr)}
              </span>
            </div>
            <div className="flex justify-between text-theme-sm">
              <span className="text-coffee-muted">Diskon</span>
              <span className="font-medium text-coffee-danger">− {formatIdr(discount)}</span>
            </div>
            <div className="flex justify-between text-theme-sm">
              <span className="text-coffee-muted">Pajak / tambahan</span>
              <span className="font-medium text-coffee-dark dark:text-coffee-cream">
                + {formatIdr(tax)}
              </span>
            </div>
            <div className="flex justify-between border-t border-coffee-linen pt-2 text-theme-sm font-semibold dark:border-coffee-night-border">
              <span className="text-coffee-dark dark:text-coffee-cream">Total PO</span>
              <span className="text-coffee-brown dark:text-coffee-caramel">
                {formatIdr(totalIdr)}
              </span>
            </div>
            <p className="pt-1 text-theme-xs text-coffee-muted">
              Status pembayaran otomatis menjadi hutang supplier sampai dicatat pelunasannya.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </form>
    </AppModal>
  );
}
