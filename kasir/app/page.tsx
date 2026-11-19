"use client";

import { ReceiptText, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";

import { CartPanel } from "@/components/cart-panel";
import { PaymentModal } from "@/components/payment-modal";
import { ProductGrid } from "@/components/product-grid";
import { ReceiptModal } from "@/components/receipt-modal";
import { PageHeader, PageLoader } from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import { cartCount, computeTotals } from "@/lib/calc";
import { formatRupiah } from "@/lib/format";
import { useKasir } from "@/lib/store";
import type {
  CartItem,
  CartModifier,
  Order,
  OrderType,
  PaymentMethod,
  Product,
} from "@/lib/types";

function autoModifiers(product: Product): CartModifier[] {
  const selected: CartModifier[] = [];
  for (const group of product.modifierGroups) {
    const requiredCount = group.isRequired
      ? Math.max(1, group.minSelect)
      : group.minSelect;
    if (requiredCount <= 0) continue;
    for (const option of group.options.slice(0, requiredCount)) {
      selected.push({
        optionId: option.id,
        groupName: group.name,
        name: option.name,
        priceDelta: option.priceDelta,
      });
    }
  }
  return selected;
}

function cartKey(productId: string, modifiers: CartModifier[]): string {
  return [productId, ...modifiers.map((modifier) => modifier.optionId)].join(
    ":",
  );
}

export default function KasirPage() {
  const {
    hydrated,
    products,
    categories,
    tables,
    config,
    orders,
    createOrder,
    payOrder,
  } = useKasir();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableId, setTableId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const effectiveOrderType: OrderType =
    orderType === "dine_in" && tables.length === 0 ? "pickup" : orderType;
  const effectiveTableId =
    tableId && tables.some((table) => table.id === tableId)
      ? tableId
      : tables[0]?.id ?? null;

  const totals = useMemo(
    () => computeTotals(cart, 0, config, effectiveOrderType),
    [cart, config, effectiveOrderType],
  );
  const count = cartCount(cart);
  const pendingCount = orders.filter(
    (order) =>
      order.paymentStatus !== "paid" &&
      order.status !== "cancelled" &&
      order.status !== "rejected",
  ).length;

  function addToCart(product: Product) {
    if (!product.available) return;
    const modifiers = autoModifiers(product);
    const key = cartKey(product.id, modifiers);
    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId: product.variantId,
          name: product.name,
          variantName: product.variantName,
          price:
            product.price +
            modifiers.reduce(
              (sum, modifier) => sum + modifier.priceDelta,
              0,
            ),
          qty: 1,
          emoji: product.emoji,
          imageUrl: product.imageUrl,
          modifiers,
        },
      ];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.key === key
            ? { ...item, qty: Math.max(0, item.qty + delta) }
            : item,
        )
        .filter((item) => item.qty > 0),
    );
  }

  function resetForm() {
    setCart([]);
    setNote("");
    setCustomerName("");
    setCustomerPhone("");
  }

  async function handleSave() {
    if (cart.length === 0 || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const order = await createOrder({
        items: cart,
        type: effectiveOrderType,
        tableId:
          effectiveOrderType === "dine_in" ? effectiveTableId : null,
        customerName,
        customerPhone,
        note,
        payment: null,
      });
      resetForm();
      setMobileCartOpen(false);
      setReceipt(order);
    } catch (error) {
      setActionError(apiErrorFrom(error, "Gagal menyimpan pesanan"));
    } finally {
      setSaving(false);
    }
  }

  function openPaymentForCart() {
    if (cart.length === 0) return;
    setActionError(null);
    setPayingOrder(null);
    setPaymentOpen(true);
  }

  function openPaymentForOrder(order: Order) {
    setActionError(null);
    setPayingOrder(order);
    setPaymentOpen(true);
  }

  async function handlePaymentConfirm(
    method: PaymentMethod,
    paidAmount: number,
  ) {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      if (payingOrder) {
        const updated = await payOrder(payingOrder.id, method, paidAmount);
        setReceipt(updated);
      } else {
        const order = await createOrder({
          items: cart,
          type: effectiveOrderType,
          tableId:
            effectiveOrderType === "dine_in" ? effectiveTableId : null,
          customerName,
          customerPhone,
          note,
          payment: { method, paidAmount },
        });
        resetForm();
        setReceipt(order);
      }
      setPaymentOpen(false);
      setPayingOrder(null);
      setMobileCartOpen(false);
    } catch (error) {
      setActionError(apiErrorFrom(error, "Pembayaran gagal diproses"));
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) return <PageLoader />;

  const cartPanelProps = {
    items: cart,
    onQty: changeQty,
    onRemove: (key: string) =>
      setCart((prev) => prev.filter((item) => item.key !== key)),
    onClear: () => setCart([]),
    orderType: effectiveOrderType,
    onOrderTypeChange: setOrderType,
    tables,
    tableId: effectiveTableId,
    onTableIdChange: setTableId,
    customerName,
    onCustomerNameChange: setCustomerName,
    customerPhone,
    onCustomerPhoneChange: setCustomerPhone,
    note,
    onNoteChange: setNote,
    config,
    saving,
    onSave: handleSave,
    onPay: openPaymentForCart,
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Kasir"
        description="Pilih menu, terima pembayaran tunai/non-tunai, lalu cetak struk."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <ReceiptText size={16} className="text-primary" />
            <span className="text-xs font-semibold text-ink-soft">
              <span className="font-black text-ink">{pendingCount}</span> pesanan
              belum lunas
            </span>
          </div>
        }
      />

      {actionError ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <ProductGrid
          products={products}
          categories={categories}
          search={search}
          onSearchChange={setSearch}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          onAdd={addToCart}
        />

        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <CartPanel {...cartPanelProps} />
          </div>
        </aside>
      </div>

      {/* Bar keranjang untuk mobile */}
      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[68px] z-30 px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-white shadow-xl shadow-primary/30"
          >
            <span className="flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <ShoppingCart size={18} />
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-black text-white">
                  {count}
                </span>
              </span>
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Total
                </span>
                <span className="block text-sm font-black tabular">
                  {formatRupiah(totals.total)}
                </span>
              </span>
            </span>
            <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-primary">
              Lihat Keranjang
            </span>
          </button>
        </div>
      ) : null}

      {/* Sheet keranjang mobile */}
      {mobileCartOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-espresso/50 backdrop-blur-[2px]"
            onClick={() => setMobileCartOpen(false)}
            aria-hidden
          />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-canvas p-3">
            <CartPanel
              {...cartPanelProps}
              onClose={() => setMobileCartOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <PaymentModal
        key={paymentOpen ? (payingOrder?.id ?? "cart") : "closed"}
        open={paymentOpen}
        total={payingOrder ? payingOrder.total : totals.total}
        title="Pembayaran"
        subtitle={
          payingOrder
            ? `Pesanan ${payingOrder.code}`
            : "Pesanan baru · pilih metode pembayaran"
        }
        error={actionError}
        busy={saving}
        onClose={() => {
          if (saving) return;
          setPaymentOpen(false);
          setPayingOrder(null);
        }}
        onConfirm={handlePaymentConfirm}
      />

      <ReceiptModal
        order={receipt}
        onClose={() => setReceipt(null)}
        onPay={openPaymentForOrder}
      />
    </div>
  );
}
