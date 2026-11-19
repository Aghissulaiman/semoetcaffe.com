"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  apiErrorFrom,
  ApiError,
  clearSession,
  getAccessToken,
  refreshSession,
  request,
  setAccessToken,
  setSessionExpiredHandler,
  writeStoredUser,
  type ApiArea,
  type ApiAuthMe,
  type ApiAuthSession,
  type ApiBranch,
  type ApiBreakdownReport,
  type ApiCategory,
  type ApiCategoryReport,
  type ApiDailyReport,
  type ApiOrder,
  type ApiPosConfig,
  type ApiProduct,
  type ApiProductReport,
  type ApiReservation,
  type ApiSalesReport,
  type ApiTable,
  type ApiUser,
} from "./api";
import { DEFAULT_POS_CONFIG } from "./calc";
import { autoPrintAcceptedOrder } from "./printer";
import type {
  Area,
  Branch,
  CartItem,
  Category,
  CreateOrderInput,
  NewReservationInput,
  Order,
  OrderStatus,
  PaymentMethod,
  PosConfig,
  Product,
  Reservation,
  ReservationStatus,
  Table,
} from "./types";

const BRANCH_KEY = "semoet.kasir.branchId";
// Pesanan dicek lebih sering supaya notifikasi dari web cepat masuk.
const ORDER_REFRESH_INTERVAL_MS = 5_000;
const RESERVATION_REFRESH_INTERVAL_MS = 20_000;

type AuthStatus = "loading" | "authenticated" | "guest";

export interface ReportsPayload {
  summary: ApiSalesReport;
  daily: ApiDailyReport[];
  breakdown: ApiBreakdownReport;
  categories: ApiCategoryReport[];
  products: ApiProductReport[];
}

interface KasirContextValue {
  authStatus: AuthStatus;
  user: ApiUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  hydrated: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  clearError: () => void;

  branches: Branch[];
  branchId: string | null;
  branch: Branch | null;
  setBranchId: (branchId: string) => void;

  areas: Area[];
  tables: Table[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  /** Pesanan baru yang belum dilihat kasir (untuk toast + suara). */
  incomingOrders: Order[];
  dismissIncomingOrders: () => void;
  reservations: Reservation[];
  config: PosConfig;

  refreshAll: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshReservations: () => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  payOrder: (
    orderId: string,
    method: PaymentMethod,
    paidAmount: number,
  ) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  addReservation: (input: NewReservationInput) => Promise<Reservation>;
  updateReservation: (
    reservationId: string,
    input: { status?: ReservationStatus; note?: string },
  ) => Promise<void>;
  fetchReports: (range: { from: string; to: string }) => Promise<ReportsPayload>;
}

const KasirContext = createContext<KasirContextValue | null>(null);

// ---------------------------------------------------------------------------
// Mapping API -> model UI
// ---------------------------------------------------------------------------
function emojiFor(name: string, categoryName = ""): string {
  const text = `${name} ${categoryName}`.toLowerCase();
  if (/(kopi|coffee|espresso|latte|americano|cappuccino|mocha|macchiato)/.test(text))
    return "☕";
  if (/(teh|tea|matcha|chocolate|choco|bomb)/.test(text)) return "🍫";
  if (/(bolu|cake|kue|pastry|croissant|bread|roti|bomboloni|donut)/.test(text))
    return "🧁";
  if (/(nasi|rice|ayam|chicken|mie|noodle|pasta|burger|sandwich)/.test(text))
    return "🍽️";
  if (/(jus|juice|smoothie|soda|mocktail|minuman)/.test(text)) return "🥤";
  if (/(camilan|snack|fries|kentang)/.test(text)) return "🍟";
  return "🍴";
}

function toCategory(row: ApiCategory): Category {
  return {
    id: row.id,
    name: row.name,
    emoji: emojiFor(row.name),
  };
}

function toProduct(row: ApiProduct): Product | null {
  const variant = row.defaultVariant;
  if (!variant) return null;
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category?.id ?? "uncategorized",
    categoryName: row.category?.name ?? "Lainnya",
    price: variant.priceIdr,
    description: row.descriptionShort ?? undefined,
    imageUrl: row.imageUrl,
    emoji: emojiFor(row.name, row.category?.name),
    available: row.isActive && row.isAvailable && variant.isAvailable,
    popular: row.isFeatured,
    variantId: variant.id,
    variantName: variant.name,
    modifierGroups: (variant.modifierGroups ?? row.modifierGroups ?? []).map(
      (group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isRequired: group.isRequired,
        options: group.options
          .filter((option) => option.isActive)
          .map((option) => ({
            id: option.id,
            name: option.name,
            priceDelta: option.priceDeltaIdr,
          })),
      }),
    ),
  };
}

function toBranch(row: ApiBranch): Branch {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    phone: row.phone,
  };
}

function toArea(row: ApiArea): Area {
  return {
    id: row.id,
    name: row.name,
    areaType: row.areaType,
    pricePerHour: row.pricePerHourIdr ?? 0,
  };
}

function toTable(row: ApiTable): Table {
  return {
    id: row.id,
    code: row.tableCode,
    areaId: row.areaId,
    areaName: row.areaName,
    capacity: row.capacity,
  };
}

function orderItems(row: ApiOrder): CartItem[] {
  return (row.items ?? []).map((item) => ({
    key: item.id,
    productId: item.productId ?? "",
    variantId: item.variantId ?? "",
    name: item.productName,
    variantName: item.variantName,
    price: item.unitPriceIdr + item.modifiersTotalIdr,
    qty: item.quantity,
    emoji: emojiFor(item.productName),
    note: item.specialInstructions ?? undefined,
    modifiers: (item.modifiers ?? []).map((modifier) => ({
      optionId: modifier.id ?? "",
      groupName: modifier.groupName,
      name: modifier.optionName,
      priceDelta: modifier.priceDeltaIdr,
    })),
  }));
}

export function toOrder(row: ApiOrder, cashier: string): Order {
  const payment = row.latestPayment;
  const paidAmount =
    row.paymentStatus === "paid"
      ? payment?.amountReceivedIdr ?? payment?.amountIdr ?? row.totalIdr
      : 0;
  return {
    id: row.id,
    code: row.orderNumber,
    createdAt: row.placedAt ?? row.createdAt,
    type: row.fulfillmentType,
    tableId: row.tableId,
    tableNumber: row.tableCode,
    customerName: row.customerName ?? row.userName,
    customerPhone: row.customerPhone ?? row.userPhone,
    items: orderItems(row),
    subtotal: row.subtotalIdr,
    discount: row.discountIdr,
    tax: row.taxIdr,
    serviceFee: row.serviceFeeIdr,
    deliveryFee: row.deliveryFeeIdr,
    total: row.totalIdr,
    paymentMethod: payment?.paymentMethod ?? null,
    paymentStatus: row.paymentStatus,
    paidAmount,
    change:
      row.paymentStatus === "paid"
        ? payment?.changeIdr ?? Math.max(0, paidAmount - row.totalIdr)
        : 0,
    status: row.orderStatus,
    cashier,
    note: row.customerNotes,
    branchId: row.branchId,
    branchName: row.branchName,
  };
}

function localDateParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function toReservation(row: ApiReservation): Reservation {
  const { date, time } = localDateParts(row.reservedFor);
  const tables: unknown[] = Array.isArray(row.tables) ? row.tables : [];
  // Endpoint admin mengirim kode meja sebagai string, sedangkan detail
  // reservasi bisa mengirim objek meja. Dukung keduanya.
  const tableIds = tables
    .map((table) => {
      if (typeof table === "string") return "";
      const record = table as Record<string, unknown>;
      return String(record.id ?? record.tableId ?? "");
    })
    .filter(Boolean);
  const tableCodes = tables
    .map((table) => {
      if (typeof table === "string") return table;
      const record = table as Record<string, unknown>;
      return String(record.tableCode ?? record.code ?? "");
    })
    .filter(Boolean);
  return {
    id: row.id,
    code: row.reservationNumber,
    createdAt: row.createdAt ?? row.reservedFor ?? "",
    name: row.contactName ?? row.userName ?? "Tamu",
    phone: row.contactPhone ?? row.userPhone ?? "-",
    date,
    time,
    reservedFor: row.reservedFor ?? "",
    durationMinutes: row.durationMinutes,
    guests: row.guestCount,
    areaId: row.areaId,
    area: row.rooms?.[0]?.name ?? row.areaName ?? "Area reguler",
    tableIds,
    tableNumber: tableCodes.length > 0 ? tableCodes.join(", ") : null,
    note: row.specialRequests,
    status: row.status as ReservationStatus,
    depositAmount: row.depositAmountIdr ?? 0,
    depositStatus: row.depositStatus,
    depositPaid: row.depositStatus === "paid",
    totalEstimate: row.totalEstimateIdr ?? 0,
    roomTotal: row.roomTotalIdr ?? 0,
    menuTotal: row.menuTotalIdr ?? 0,
    branchId: row.branchId,
  };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `kasir-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reservationIso(date: string, time: string): string {
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  return parsed.toISOString();
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function KasirProvider({ children }: { children: ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<ApiUser | null>(null);

  const [bootstrapped, setBootstrapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [config, setConfig] = useState<PosConfig>(DEFAULT_POS_CONFIG);

  const branchRef = useRef<string | null>(null);
  const userRef = useRef<ApiUser | null>(null);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const ordersReadyRef = useRef(false);
  const ordersRequestSeqRef = useRef(0);

  useEffect(() => {
    branchRef.current = branchId;
  }, [branchId]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  const resetData = useCallback(() => {
    setBranches([]);
    setBranchIdState(null);
    setAreas([]);
    setTables([]);
    setCategories([]);
    setProducts([]);
    setOrders([]);
    setIncomingOrders([]);
    setReservations([]);
    setConfig(DEFAULT_POS_CONFIG);
    seenOrderIdsRef.current.clear();
    ordersReadyRef.current = false;
    ordersRequestSeqRef.current += 1;
    setBootstrapped(false);
  }, []);

  /**
   * Simpan daftar order sekaligus deteksi order baru dari web pelanggan.
   * `reset` dipakai saat ganti cabang / load awal supaya order lama tidak
   * dianggap sebagai notifikasi baru.
   */
  const applyOrders = useCallback(
    (
      next: Order[],
      options: { reset?: boolean; notify?: boolean } = {},
    ) => {
      const seen = seenOrderIdsRef.current;

      if (options.reset || !ordersReadyRef.current) {
        seen.clear();
        next.forEach((order) => seen.add(order.id));
        ordersReadyRef.current = true;
        setIncomingOrders([]);
        setOrders(next);
        return;
      }

      const fresh = options.notify
        ? next.filter(
            (order) => !seen.has(order.id) && order.status === "placed",
          )
        : [];

      next.forEach((order) => seen.add(order.id));
      setOrders(next);

      setIncomingOrders((prev) => {
        const stillNew = prev.filter((order) => {
          const current = next.find((item) => item.id === order.id);
          return current?.status === "placed";
        });
        const freshIds = new Set(fresh.map((order) => order.id));
        return [
          ...fresh,
          ...stillNew.filter((order) => !freshIds.has(order.id)),
        ];
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
    setAuthStatus("guest");
    resetData();
  }, [resetData]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setAuthStatus("guest");
      resetData();
    });
    return () => setSessionExpiredHandler(null);
  }, [resetData]);

  // Pulihkan sesi saat aplikasi dibuka ulang.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let token = await getAccessToken();
        if (!token) token = await refreshSession();
        if (!token) {
          if (!cancelled) setAuthStatus("guest");
          return;
        }
        const me = await api<ApiAuthMe>("/auth/me");
        if (cancelled) return;
        // Endpoint /auth/me mengembalikan { user, roles, permissions }.
        setUser(me.user);
        writeStoredUser(me.user);
        setAuthStatus("authenticated");
      } catch {
        await clearSession();
        if (!cancelled) setAuthStatus("guest");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBranch = useCallback(
    async (id: string, initial = false) => {
      if (initial) {
        setLoading(true);
        // Cabang baru: jadikan order yang sudah ada sebagai baseline, bukan
        // notifikasi baru.
        seenOrderIdsRef.current.clear();
        ordersReadyRef.current = false;
        setIncomingOrders([]);
      }
      setError(null);
      const ordersSeq = ++ordersRequestSeqRef.current;
      try {
        const [branchAreas, branchTables, categoryRows, productResult, orderResult, reservationResult] =
          await Promise.all([
            api<ApiArea[]>(`/branches/${id}/areas`).catch(() => []),
            api<ApiTable[]>(`/branches/${id}/tables`, {
              query: { limit: 100 },
            }).catch(() => []),
            api<ApiCategory[]>("/categories").catch(() => []),
            // Produk dikelola global di katalog. Filter `branchId` hanya
            // mengembalikan produk yang sudah dipetakan ke cabang, sedangkan
            // data POS saat ini belum punya pemetaan tersebut.
            api<ApiProduct[]>("/products", {
              query: { limit: 60, includeModifiers: true },
            }).catch(() => []),
            request<ApiOrder[]>("/admin/orders", {
              query: { branchId: id, limit: 100, sort: "recent" },
            }).catch(() => ({ data: [] as ApiOrder[] })),
            request<ApiReservation[]>("/admin/reservations", {
              query: { branchId: id, limit: 100 },
            }).catch(() => ({ data: [] as ApiReservation[] })),
          ]);

        setAreas(branchAreas.map(toArea));
        setTables(branchTables.map(toTable));
        setCategories(categoryRows.map(toCategory));
        setProducts(
          productResult
            .map(toProduct)
            .filter((product): product is Product => product !== null),
        );
        // Jangan timpa data order yang lebih baru dari polling.
        if (ordersSeq === ordersRequestSeqRef.current) {
          applyOrders(
            (orderResult.data ?? []).map((row) =>
              toOrder(row, userRef.current?.displayName ?? "Kasir"),
            ),
            { reset: initial, notify: !initial },
          );
        }
        setReservations((reservationResult.data ?? []).map(toReservation));
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat data cabang"));
      } finally {
        if (initial) setLoading(false);
      }
    },
    [applyOrders],
  );

  // Bootstrap setelah login.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [branchRows, posConfig] = await Promise.all([
          api<ApiBranch[]>("/branches"),
          api<ApiPosConfig>("/config/pos"),
        ]);
        if (cancelled) return;

        const activeBranches = branchRows.filter((row) => row.isActive);
        const mappedBranches = activeBranches.map(toBranch);
        setBranches(mappedBranches);
        setConfig({ ...DEFAULT_POS_CONFIG, ...posConfig });

        if (mappedBranches.length === 0) {
          setBootstrapped(true);
          setLoading(false);
          return;
        }

        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(BRANCH_KEY);
        } catch {
          stored = null;
        }

        let chosen =
          stored && mappedBranches.some((branch) => branch.id === stored)
            ? stored
            : null;

        if (!chosen) {
          // Pilih cabang yang punya meja aktif agar POS langsung bisa dipakai,
          // lalu fallback ke cabang pertama.
          const counts = await Promise.all(
            mappedBranches.map(async (branch) => {
              try {
                const rows = await api<ApiTable[]>(
                  `/branches/${branch.id}/tables`,
                  { query: { limit: 100 } },
                );
                return rows.length;
              } catch {
                return 0;
              }
            }),
          );
          chosen =
            mappedBranches.find((_, index) => counts[index] > 0)?.id ??
            mappedBranches[0].id;
        }

        setBranchIdState(chosen);
        try {
          window.localStorage.setItem(BRANCH_KEY, chosen);
        } catch {
          // abaikan
        }
        await loadBranch(chosen, true);
        if (!cancelled) setBootstrapped(true);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorFrom(err, "Gagal memuat data awal"));
          setBootstrapped(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, loadBranch]);

  const refreshOrders = useCallback(async () => {
    const id = branchRef.current;
    if (!id) return;

    // Abaikan respons lama kalau ada polling yang lebih baru / cabang berubah.
    const requestSeq = ++ordersRequestSeqRef.current;
    try {
      const result = await request<ApiOrder[]>("/admin/orders", {
        query: { branchId: id, limit: 100, sort: "recent" },
      });
      if (
        requestSeq !== ordersRequestSeqRef.current ||
        branchRef.current !== id
      ) {
        return;
      }
      applyOrders(
        (result.data ?? []).map((row) =>
          toOrder(row, userRef.current?.displayName ?? "Kasir"),
        ),
        { notify: true },
      );
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(apiErrorFrom(err, "Gagal memuat pesanan"));
      }
    }
  }, [applyOrders]);

  const refreshReservations = useCallback(async () => {
    const id = branchRef.current;
    if (!id) return;
    try {
      const result = await request<ApiReservation[]>("/admin/reservations", {
        query: { branchId: id, limit: 100 },
      });
      setReservations((result.data ?? []).map(toReservation));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(apiErrorFrom(err, "Gagal memuat reservasi"));
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const id = branchRef.current;
    if (!id) return;
    setRefreshing(true);
    try {
      await loadBranch(id);
    } finally {
      setRefreshing(false);
    }
  }, [loadBranch]);

  // Pesanan dari web pelanggan dicek tiap 5 detik supaya notifikasi cepat
  // masuk; reservasi cukup tiap 20 detik. Refresh juga saat tab kembali aktif.
  useEffect(() => {
    if (authStatus !== "authenticated" || !branchId) return;

    const orderTimer = window.setInterval(() => {
      void refreshOrders();
    }, ORDER_REFRESH_INTERVAL_MS);
    const reservationTimer = window.setInterval(() => {
      void refreshReservations();
    }, RESERVATION_REFRESH_INTERVAL_MS);

    const refreshNow = () => {
      void refreshOrders();
      void refreshReservations();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshNow();
    };

    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(orderTimer);
      window.clearInterval(reservationTimer);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authStatus, branchId, refreshOrders, refreshReservations]);

  const setBranchId = useCallback(
    (id: string) => {
      if (id === branchRef.current) return;
      ordersRequestSeqRef.current += 1;
      setBranchIdState(id);
      branchRef.current = id;
      try {
        window.localStorage.setItem(BRANCH_KEY, id);
      } catch {
        // abaikan
      }
      void loadBranch(id, true);
    },
    [loadBranch],
  );

  const login = useCallback(async (identifier: string, password: string) => {
    setError(null);
    const session = await api<ApiAuthSession>("/auth/login", {
      method: "POST",
      auth: false,
      body: { identifier, password },
    });
    await setAccessToken(session.accessToken, session.expiresIn);
    writeStoredUser(session.user);
    setBootstrapped(false);
    setUser(session.user);
    setAuthStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", {
        method: "POST",
        body: {},
        auth: true,
      }).catch(() => undefined);
    } finally {
      await signOut();
    }
  }, [signOut]);

  const payOrderInternal = useCallback(
    async (
      target: Order,
      method: PaymentMethod,
      paidAmount: number,
    ): Promise<Order> => {
      const result = await api<{
        payment: { id: string };
        order: {
          id: string;
          orderStatus: OrderStatus;
          paymentStatus: "paid";
          totalIdr: number;
          paidIdr: number;
          amountReceivedIdr: number;
          changeIdr: number;
        };
      }>(`/admin/orders/${target.id}/payments`, {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: {
          paymentMethod: method,
          amountReceivedIdr: Math.max(0, Math.round(paidAmount)),
        },
      });

      const updated: Order = {
        ...target,
        paymentStatus: "paid",
        paymentMethod: method,
        paidAmount: result.order.amountReceivedIdr,
        change: result.order.changeIdr,
        total: result.order.totalIdr,
      };
      setOrders((prev) =>
        prev.map((order) => (order.id === updated.id ? updated : order)),
      );
      return updated;
    },
    [],
  );

  const createOrder = useCallback(
    async (input: CreateOrderInput): Promise<Order> => {
      const id = branchRef.current;
      if (!id) throw new Error("Cabang belum dipilih");

      const created = await api<ApiOrder>("/orders", {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: {
          branchId: id,
          fulfillmentType: input.type,
          items: input.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.qty,
            modifiers: item.modifiers
              .filter((modifier) => Boolean(modifier.optionId))
              .map((modifier) => ({
                optionId: modifier.optionId,
                quantity: 1,
              })),
            specialInstructions: item.note?.trim() || null,
          })),
          tableId:
            input.type === "dine_in" ? input.tableId ?? null : null,
          // Walk-in tanpa nama tetap diberi label agar tidak jatuh ke nama
          // staf yang membuat pesanan.
          customerName: input.customerName?.trim() || "Walk-in",
          customerPhone: input.customerPhone?.trim() || null,
          customerNotes: input.note?.trim() || null,
        },
      });

      // Pesanan yang dibuat dari kasir sendiri tidak perlu memicu notifikasi.
      seenOrderIdsRef.current.add(created.id);

      const cashier = userRef.current?.displayName ?? "Kasir";
      let mapped: Order = {
        ...toOrder(created, cashier),
        type: input.type,
        tableId:
          input.type === "dine_in" ? input.tableId ?? null : null,
        tableNumber:
          tables.find((table) => table.id === input.tableId)?.code ?? null,
        customerName: input.customerName?.trim() || "Walk-in",
        customerPhone: input.customerPhone?.trim() || null,
        note: input.note?.trim() || null,
        branchId: id,
        branchName:
          branches.find((branch) => branch.id === id)?.name ?? null,
        items: input.items,
      };

      if (input.payment) {
        mapped = await payOrderInternal(
          mapped,
          input.payment.method,
          input.payment.paidAmount,
        );
      }

      await refreshOrders();
      return mapped;
    },
    [branches, tables, refreshOrders, payOrderInternal],
  );

  const payOrder = useCallback(
    async (orderId: string, method: PaymentMethod, paidAmount: number) => {
      const target = orders.find((order) => order.id === orderId);
      if (!target) throw new Error("Pesanan tidak ditemukan");
      const updated = await payOrderInternal(target, method, paidAmount);
      await refreshOrders();
      return updated;
    },
    [orders, payOrderInternal, refreshOrders],
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      const target = orders.find((order) => order.id === orderId);
      await api(`/admin/orders/${orderId}/status`, {
        method: "PATCH",
        body: { toStatus: status },
      });
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status } : order,
        ),
      );
      setIncomingOrders((prev) =>
        prev.filter((order) => order.id !== orderId),
      );

      // Cetak otomatis saat kasir menerima pesanan baru. Jangan menunggu
      // printer selesai supaya status pesanan tetap responsif.
      if (status === "accepted" && target && target.status !== "accepted") {
        const acceptedOrder: Order = { ...target, status };
        void autoPrintAcceptedOrder(
          acceptedOrder,
          products,
        ).catch((err) => {
          setError(
            apiErrorFrom(
              err,
              "Pesanan diterima, tetapi cetak otomatis gagal. Buka menu Printer untuk menghubungkan printer lewat USB atau Bluetooth.",
            ),
          );
        });
      }

      await refreshOrders();
    },
    [orders, products, refreshOrders],
  );

  const addReservation = useCallback(
    async (input: NewReservationInput): Promise<Reservation> => {
      const id = branchRef.current;
      if (!id) throw new Error("Cabang belum dipilih");
      const created = await api<ApiReservation>("/admin/reservations", {
        method: "POST",
        body: {
          branchId: id,
          areaId: input.areaId,
          reservedFor: reservationIso(input.date, input.time),
          durationMinutes: input.durationMinutes,
          guestCount: input.guests,
          status: "confirmed",
          contactName: input.name.trim() || null,
          contactPhone: input.phone.trim() || null,
          specialRequests: input.note?.trim() || null,
          tableIds: input.tableIds,
        },
      });
      const mapped = toReservation(created);
      setReservations((prev) => [mapped, ...prev]);
      await refreshReservations();
      return mapped;
    },
    [refreshReservations],
  );

  const updateReservation = useCallback(
    async (
      reservationId: string,
      input: { status?: ReservationStatus; note?: string },
    ) => {
      await api(`/admin/reservations/${reservationId}`, {
        method: "PATCH",
        body: {
          status: input.status,
          note: input.note,
        },
      });
      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === reservationId && input.status
            ? { ...reservation, status: input.status }
            : reservation,
        ),
      );
      await refreshReservations();
    },
    [refreshReservations],
  );

  const fetchReports = useCallback(
    async (range: { from: string; to: string }): Promise<ReportsPayload> => {
      const id = branchRef.current;
      if (!id) throw new Error("Cabang belum dipilih");
      const query = { from: range.from, to: range.to, branchId: id };
      const [summary, daily, breakdown, categoryRows, productRows] =
        await Promise.all([
          api<ApiSalesReport>("/admin/reports/sales", { query }),
          api<ApiDailyReport[]>("/admin/reports/daily", { query }),
          api<ApiBreakdownReport>("/admin/reports/breakdown", { query }),
          api<ApiCategoryReport[]>("/admin/reports/categories", { query }),
          api<ApiProductReport[]>("/admin/reports/products", {
            query: { ...query, limit: 100 },
          }),
        ]);
      return {
        summary,
        daily,
        breakdown,
        categories: categoryRows,
        products: productRows,
      };
    },
    [],
  );

  const dismissIncomingOrders = useCallback(() => {
    setIncomingOrders([]);
  }, []);

  const hydrated =
    authStatus === "guest" ||
    (authStatus === "authenticated" && bootstrapped);

  const branch = useMemo(
    () => branches.find((item) => item.id === branchId) ?? null,
    [branches, branchId],
  );

  const value = useMemo<KasirContextValue>(
    () => ({
      authStatus,
      user,
      login,
      logout,
      hydrated,
      loading,
      refreshing,
      error,
      clearError,
      branches,
      branchId,
      branch,
      setBranchId,
      areas,
      tables,
      categories,
      products,
      orders,
      incomingOrders,
      dismissIncomingOrders,
      reservations,
      config,
      refreshAll,
      refreshOrders,
      refreshReservations,
      createOrder,
      payOrder,
      updateOrderStatus,
      addReservation,
      updateReservation,
      fetchReports,
    }),
    [
      authStatus,
      user,
      login,
      logout,
      hydrated,
      loading,
      refreshing,
      error,
      clearError,
      branches,
      branchId,
      branch,
      setBranchId,
      areas,
      tables,
      categories,
      products,
      orders,
      incomingOrders,
      dismissIncomingOrders,
      reservations,
      config,
      refreshAll,
      refreshOrders,
      refreshReservations,
      createOrder,
      payOrder,
      updateOrderStatus,
      addReservation,
      updateReservation,
      fetchReports,
    ],
  );

  return <KasirContext.Provider value={value}>{children}</KasirContext.Provider>;
}

export function useKasir(): KasirContextValue {
  const context = useContext(KasirContext);
  if (!context) throw new Error("useKasir harus dipakai di dalam KasirProvider");
  return context;
}
