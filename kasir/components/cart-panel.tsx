"use client";

import {
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import {
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  TextArea,
} from "@/components/ui";
import { cartCount, computeTotals } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { formatRupiah, ORDER_TYPE_SHORT } from "@/lib/format";
import type {
  CartItem,
  OrderType,
  PosConfig,
  Table,
} from "@/lib/types";

const ORDER_TYPES: {
  value: OrderType;
  label: string;
  icon: typeof Utensils;
}[] = [
  { value: "dine_in", label: "Dine In", icon: Utensils },
  { value: "pickup", label: "Bawa Pulang", icon: ShoppingBag },
];

export interface CartPanelProps {
  items: CartItem[];
  onQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  orderType: OrderType;
  onOrderTypeChange: (value: OrderType) => void;
  tables: Table[];
  tableId: string | null;
  onTableIdChange: (value: string | null) => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  config: PosConfig;
  saving?: boolean;
  onSave: () => void;
  onPay: () => void;
  onClose?: () => void;
}

export function CartPanel({
  items,
  onQty,
  onRemove,
  onClear,
  orderType,
  onOrderTypeChange,
  tables,
  tableId,
  onTableIdChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  note,
  onNoteChange,
  config,
  saving = false,
  onSave,
  onPay,
  onClose,
}: CartPanelProps) {
  const totals = computeTotals(items, 0, config, orderType);
  const count = cartCount(items);
  const empty = items.length === 0;
  const hasTables = tables.length > 0;
  const canSubmit =
    !empty && (orderType !== "dine_in" || Boolean(tableId));

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_20px_rgba(42,26,17,0.05)]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <ShoppingCart size={16} />
          </span>
          <div>
            <p className="text-sm font-black text-ink">Pesanan Baru</p>
            <p className="text-[11px] text-muted">
              {empty
                ? "Keranjang kosong"
                : `${count} item · ${ORDER_TYPE_SHORT[orderType]}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!empty ? (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-danger transition hover:bg-danger-soft"
            >
              <Trash2 size={13} />
              Kosongkan
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup keranjang"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="grid grid-cols-2 gap-1.5">
          {ORDER_TYPES.map((option) => {
            const Icon = option.icon;
            const active = orderType === option.value;
            const disabled = option.value === "dine_in" && !hasTables;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => onOrderTypeChange(option.value)}
                className={cn(
                  "focus-ring flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-extrabold transition",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-ink-soft hover:border-primary/40 hover:text-primary",
                  disabled &&
                    "cursor-not-allowed opacity-40 hover:border-line hover:text-ink-soft",
                )}
              >
                <Icon size={15} />
                {option.label}
              </button>
            );
          })}
        </div>

        {orderType === "dine_in" ? (
          <Field label="Meja" className="gap-1">
            <Select
              value={tableId ?? ""}
              onChange={(event) =>
                onTableIdChange(event.target.value || null)
              }
              className="h-10 text-xs"
            >
              <option value="">Pilih meja…</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code}
                  {table.areaName ? ` · ${table.areaName}` : ""} (
                  {table.capacity} org)
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {!hasTables ? (
          <p className="rounded-lg bg-warning-soft px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-warning">
            Cabang ini belum punya meja aktif. Pesanan baru memakai mode bawa
            pulang; tambahkan meja lewat admin untuk mengaktifkan dine-in.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Nama pelanggan" className="gap-1">
            <Input
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="Opsional"
              className="h-10 text-xs"
            />
          </Field>
          <Field label="No. telepon" className="gap-1">
            <Input
              value={customerPhone}
              onChange={(event) => onCustomerPhoneChange(event.target.value)}
              placeholder="Opsional"
              inputMode="tel"
              className="h-10 text-xs"
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-line">
        {empty ? (
          <div className="p-4">
            <EmptyState
              icon={<ShoppingCart size={22} />}
              title="Belum ada item"
              description="Klik menu di sebelah kiri untuk menambahkan ke pesanan."
            />
          </div>
        ) : (
          <ul className="thin-scroll max-h-[30vh] divide-y divide-line/70 overflow-y-auto px-4">
            {items.map((item) => (
              <li key={item.key} className="flex gap-2.5 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cream text-lg">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    item.emoji
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold text-ink">
                    {item.name}
                  </p>
                  {item.variantName ? (
                    <p className="truncate text-[10px] text-muted">
                      {item.variantName}
                    </p>
                  ) : null}
                  {item.modifiers.length > 0 ? (
                    <p className="truncate text-[10px] text-muted">
                      {item.modifiers.map((modifier) => modifier.name).join(", ")}
                    </p>
                  ) : null}
                  <p className="text-[11px] font-semibold text-primary tabular">
                    {formatRupiah(item.price)}
                  </p>
                  {item.note ? (
                    <p className="truncate text-[10px] text-muted">{item.note}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 rounded-lg border border-line bg-milk p-0.5">
                    <button
                      type="button"
                      onClick={() => onQty(item.key, -1)}
                      aria-label={`Kurangi ${item.name}`}
                      className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface hover:text-danger"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-5 text-center text-[11px] font-black text-ink tabular">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQty(item.key, 1)}
                      aria-label={`Tambah ${item.name}`}
                      className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface hover:text-primary"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-ink tabular">
                      {formatRupiah(item.price * item.qty)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(item.key)}
                      aria-label={`Hapus ${item.name}`}
                      className="focus-ring flex h-5 w-5 items-center justify-center rounded text-muted transition hover:bg-danger-soft hover:text-danger"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div>
          <Field label="Catatan pesanan" className="gap-1">
            <TextArea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Contoh: es sedikit, tanpa gula…"
              className="min-h-[54px] text-xs"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-col gap-1 rounded-xl bg-milk px-3 py-2.5 text-xs">
          <div className="flex items-center justify-between text-ink-soft">
            <span>Subtotal</span>
            <span className="font-bold tabular">
              {formatRupiah(totals.subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between text-ink-soft">
            <span>Pajak {config.taxPercent}%</span>
            <span className="font-bold tabular">{formatRupiah(totals.tax)}</span>
          </div>
          {totals.serviceFee > 0 ? (
            <div className="flex items-center justify-between text-ink-soft">
              <span>Biaya layanan</span>
              <span className="font-bold tabular">
                {formatRupiah(totals.serviceFee)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between border-t border-dashed border-line pt-2">
            <span className="text-sm font-black text-ink">Total</span>
            <span className="text-lg font-black text-primary tabular">
              {formatRupiah(totals.total)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="md"
            disabled={!canSubmit || saving}
            onClick={onSave}
            className="text-xs"
          >
            Simpan
          </Button>
          <Button
            size="md"
            disabled={!canSubmit || saving}
            onClick={onPay}
            className="text-xs"
          >
            Bayar
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted">
          Simpan = pesanan masuk belum dibayar
        </p>
      </div>
    </div>
  );
}
