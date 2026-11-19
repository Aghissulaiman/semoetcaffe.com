/**
 * Klien HTTP untuk `semoet_service` (prefix /api/v1).
 *
 * Access token disimpan di localStorage; refresh token berupa cookie httpOnly
 * yang ikut terkirim karena semua request memakai `credentials: "include"`.
 * Di development `/api/v1/*` diproxy oleh Next.js (lihat `next.config.ts`).
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "/api/v1";

const ACCESS_TOKEN_KEY = "semoet.kasir.accessToken";
const TOKEN_EXPIRES_KEY = "semoet.kasir.accessTokenExpiresAt";
const USER_KEY = "semoet.kasir.user";

const REQUEST_TIMEOUT_MS = 30_000;
const REFRESH_LEEWAY_MS = 30_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: { field?: string; message?: string }[];
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    options?: { details?: ApiError["details"]; requestId?: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options?.details;
    this.requestId = options?.requestId;
  }

  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      if (detail.field && detail.message) {
        const key = detail.field.replace(/^(body|query|params)\./, "");
        if (!(key in result)) result[key] = detail.message;
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Tipe response backend (hanya yang dipakai aplikasi kasir)
// ---------------------------------------------------------------------------
export interface ApiUser {
  id: string;
  email: string | null;
  phoneE164: string | null;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface ApiAuthSession {
  user: ApiUser;
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
}

export interface ApiAuthMe {
  user: ApiUser;
  roles: { code: string; name: string }[];
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Shift kasir
// ---------------------------------------------------------------------------
export interface ApiShiftStaff {
  id: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  lastLoginAt: string | null;
  roleCodes: string[];
}

export interface ApiShift {
  id: string;
  branchId: string;
  branchName: string | null;
  staffUserId: string;
  staffName: string;
  staffEmail: string | null;
  status: "open" | "closed";
  openedAt: string | null;
  closedAt: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedDurationMinutes: number | null;
  durationMinutes: number;
  openingCashIdr: number;
  closingCashIdr: number | null;
  expectedCashIdr: number;
  cashDifferenceIdr: number | null;
  notes: string | null;
  closingNotes: string | null;
  openedByName: string | null;
  closedByName: string | null;
  orderCount: number;
  salesIdr: number;
  cashSalesIdr: number;
  nonCashSalesIdr: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Status buka/tutup toko
// ---------------------------------------------------------------------------
export type ApiStoreMode = "auto" | "open" | "closed";

export interface ApiStoreSchedule {
  opensAt: string;
  closesAt: string;
  isConfigured: boolean;
  dayCount: number;
}

export interface ApiStoreStatus {
  branchId: string;
  branchName: string;
  timezone: string;
  mode: ApiStoreMode;
  isOpen: boolean;
  source: "schedule" | "manual";
  schedule: ApiStoreSchedule;
  today: {
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  };
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

// ---------------------------------------------------------------------------
// Stok bahan baku
// ---------------------------------------------------------------------------
export interface ApiStockLocation {
  id: string;
  name: string;
  movementCount: number;
}

export interface ApiStockLocationBalance {
  stockLocationId: string;
  stockLocationName: string;
  onHand: number;
}

export interface ApiStockSnapshotItem {
  ingredientId: string;
  sku: string;
  name: string;
  baseUnit: string;
  reorderLevel: number;
  isActive: boolean;
  onHand: number;
  lowStock: boolean;
  lastMovementAt: string | null;
  byLocation: ApiStockLocationBalance[];
}

export interface ApiStockSnapshot {
  stockLocationId: string | null;
  locations: ApiStockLocation[];
  summary: {
    ingredientCount: number;
    locationCount: number;
    lowStockCount: number;
  };
  items: ApiStockSnapshotItem[];
}

export interface ApiStockOpnameDocument {
  id: string;
  number: string;
  stockLocationId: string;
  stockLocationName: string | null;
  status: string;
  opnameDate: string | null;
  notes: string | null;
  cancelReason: string | null;
  postedAt: string | null;
  postedByName: string | null;
  createdByName: string | null;
  itemCount: number;
  surplusCount: number;
  defectCount: number;
  totalDifference: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApiStockOpnameItem {
  id: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  systemQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
  notes: string | null;
}

export interface ApiStockOpnameDetail {
  document: ApiStockOpnameDocument;
  items: ApiStockOpnameItem[];
}

export interface ApiCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ApiModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDeltaIdr: number;
  isActive: boolean;
}

export interface ApiModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: ApiModifierOption[];
}

export interface ApiVariant {
  id: string;
  name: string;
  sku: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  isDefault: boolean;
  isAvailable: boolean;
  modifierGroups?: ApiModifierGroup[];
}

export interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  descriptionShort: string | null;
  productKind: string;
  isActive: boolean;
  isFeatured: boolean;
  basePriceIdr: number;
  maxPriceIdr: number | null;
  imageUrl: string | null;
  category: { id: string; slug: string; name: string } | null;
  isAvailable: boolean;
  modifierGroups: ApiModifierGroup[];
  defaultVariant: ApiVariant | null;
}

export interface ApiBranch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string;
  timezone: string;
  isActive: boolean;
}

export interface ApiArea {
  id: string;
  branchId: string;
  name: string;
  areaType: string | null;
  pricePerHourIdr: number | null;
  imageUrl: string | null;
  isActive: boolean;
  tableCount: number;
  totalCapacity: number;
}

export interface ApiTable {
  id: string;
  areaId: string | null;
  tableCode: string;
  capacity: number;
  isActive: boolean;
  areaName: string | null;
  areaType: string | null;
}

export type ApiOrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "rejected";

export type ApiPaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "failed";

export type ApiPaymentMethod =
  | "qris"
  | "virtual_account"
  | "bank_transfer"
  | "ewallet"
  | "card"
  | "cash";

export interface ApiOrderItemModifier {
  id: string | null;
  groupName: string;
  optionName: string;
  priceDeltaIdr: number;
  quantity: number;
}

export interface ApiOrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPriceIdr: number;
  modifiersTotalIdr: number;
  lineTotalIdr: number;
  itemStatus: string;
  specialInstructions: string | null;
  modifiers: ApiOrderItemModifier[];
}

export interface ApiPaymentBrief {
  id: string;
  provider: string;
  paymentMethod: ApiPaymentMethod;
  transactionType: string;
  status: string;
  amountIdr: number;
  amountReceivedIdr: number | null;
  changeIdr: number | null;
  currency: string;
  paidAt: string | null;
  createdAt: string;
}

export interface ApiOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  branchName: string | null;
  branchCode: string | null;
  fulfillmentType: "delivery" | "pickup" | "dine_in";
  orderStatus: ApiOrderStatus;
  paymentStatus: ApiPaymentStatus;
  currency: string;
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  deliveryFeeIdr: number;
  serviceFeeIdr: number;
  totalIdr: number;
  itemCount: number;
  placedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userPhone: string | null;
  customerName: string | null;
  customerPhone: string | null;
  tableId: string | null;
  tableCode: string | null;
  customerNotes: string | null;
  items: ApiOrderItem[];
  latestPayment: ApiPaymentBrief | null;
}

export interface ApiReservationRoom {
  areaId: string;
  name: string;
  areaType: string | null;
  pricePerHourIdr: number | null;
  imageUrl: string | null;
}

export interface ApiReservation {
  id: string;
  reservationNumber: string;
  branchId: string;
  branchName: string | null;
  areaId: string | null;
  areaName: string | null;
  rooms: ApiReservationRoom[];
  reservedFor: string | null;
  endsAt: string | null;
  durationMinutes: number;
  guestCount: number;
  status: string;
  userName: string | null;
  userEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  userPhone: string | null;
  specialRequests: string | null;
  tables: unknown[];
  totalEstimateIdr: number | null;
  roomTotalIdr: number | null;
  menuTotalIdr: number | null;
  depositAmountIdr: number | null;
  depositStatus: string;
  deposit2AmountIdr: number | null;
  deposit2Status: string;
  settlementAmountIdr: number | null;
  settlementStatus: string;
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Chat pelanggan
// ---------------------------------------------------------------------------
export interface ApiChatConversation {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  topic: string;
  category: string;
  status: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
  createdAt: string | null;
}

export interface ApiChatMessage {
  id: string;
  conversationId: string;
  senderType: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  attachmentStorageKey: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface ApiPosConfig {
  currency: string;
  timezone: string;
  taxPercent: number;
  serviceFeeIdr: number;
  deliveryFeeIdr: number;
  orderNumberPrefix: string;
}

export interface ApiSalesReport {
  branchId: string | null;
  from: string | null;
  to: string | null;
  grossSalesIdr: number;
  discountIdr: number;
  netSalesIdr: number;
  taxIdr: number;
  serviceFeeIdr: number;
  deliveryFeeIdr: number;
  totalBilledIdr: number;
  cogsIdr: number;
  profitIdr: number;
  itemsSold: number;
  itemRevenueIdr: number;
  orderCount: number;
  productCount: number;
}

export interface ApiDailyReport {
  businessDate: string;
  orderCount: number;
  grossIdr: number;
  discountIdr: number;
  netIdr: number;
  itemsSold: number;
  cogsIdr: number;
  profitIdr: number;
}

export interface ApiBreakdownRow {
  key: string;
  orderCount: number;
  revenueIdr: number;
}

export interface ApiBreakdownReport {
  fulfillment: ApiBreakdownRow[];
  payment: ApiBreakdownRow[];
  hourly: ApiBreakdownRow[];
  weekday: ApiBreakdownRow[];
  status: { orderStatus: string; count: number }[];
}

export interface ApiCategoryReport {
  categoryId: string;
  categoryName: string;
  quantity: number;
  orderCount: number;
  revenueIdr: number;
  cogsIdr: number;
  profitIdr: number;
}

export interface ApiProductReport {
  productId: string;
  productName: string;
  quantity: number;
  orderCount: number;
  revenueIdr: number;
  cogsIdr: number;
  profitIdr: number;
}

// ---------------------------------------------------------------------------
// Penyimpanan sesi
// ---------------------------------------------------------------------------
let cachedToken: string | null | undefined;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setAccessToken(
  token: string | null,
  expiresInSeconds?: number,
): Promise<void> {
  cachedToken = token;
  try {
    const store = storage();
    if (!store) return;
    if (token) {
      store.setItem(ACCESS_TOKEN_KEY, token);
      store.setItem(
        TOKEN_EXPIRES_KEY,
        String(Date.now() + (expiresInSeconds ?? 900) * 1000),
      );
    } else {
      store.removeItem(ACCESS_TOKEN_KEY);
      store.removeItem(TOKEN_EXPIRES_KEY);
    }
  } catch {
    // Token tetap hidup di memori.
  }
}

export function readStoredUser(): ApiUser | null {
  try {
    const raw = storage()?.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function writeStoredUser(user: ApiUser | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (user) store.setItem(USER_KEY, JSON.stringify(user));
    else store.removeItem(USER_KEY);
  } catch {
    // abaikan
  }
}

export async function clearSession(): Promise<void> {
  await setAccessToken(null);
  writeStoredUser(null);
}

let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function isTokenExpiringSoon(): Promise<boolean> {
  try {
    const raw = storage()?.getItem(TOKEN_EXPIRES_KEY);
    if (!raw) return false;
    return Number(raw) - Date.now() < REFRESH_LEEWAY_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------
export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  auth?: boolean;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface ApiResult<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  };
}

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.status === 401 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      if (!response.ok) return null;
      const json = (await response.json()) as {
        data?: { accessToken?: string; expiresIn?: number };
      };
      const token = json.data?.accessToken;
      if (!token) return null;
      await setAccessToken(token, json.data?.expiresIn);
      return token;
    } catch {
      return null;
    }
  }
  return null;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Pulihkan sesi dari cookie refresh (dipakai saat aplikasi dibuka ulang). */
export function refreshSession(): Promise<string | null> {
  return refreshAccessToken();
}

async function performRequest<T>(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<ApiResult<T>> {
  const {
    method = "GET",
    body,
    query,
    auth = true,
    headers = {},
    idempotencyKey,
  } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}${buildQuery(query)}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return { data: undefined as T };

    const json = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          data?: T;
          meta?: ApiResult<T>["meta"];
          message?: string;
          details?: ApiError["details"];
          requestId?: string;
          error?: {
            code?: string;
            message?: string;
            details?: ApiError["details"];
          };
        }
      | null;

    if (!response.ok) {
      throw new ApiError(
        json?.error?.message ??
          json?.message ??
          `Permintaan gagal (HTTP ${response.status})`,
        response.status,
        {
          details: json?.error?.details ?? json?.details,
          requestId: json?.requestId,
        },
      );
    }

    return { data: json?.data as T, meta: json?.meta };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (
      (error instanceof DOMException || error instanceof Error) &&
      error.name === "AbortError"
    ) {
      throw new ApiError("Koneksi lambat, coba lagi", 0);
    }
    throw new ApiError(
      error instanceof Error ? error.message : "Tidak dapat terhubung ke server",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { auth = true } = options;
  let token = auth ? await getAccessToken() : null;
  const isAuthEndpoint = path.startsWith("/auth/");

  if (
    auth &&
    token &&
    !isAuthEndpoint &&
    (await isTokenExpiringSoon())
  ) {
    token = (await refreshAccessToken()) ?? token;
  }

  try {
    return await performRequest<T>(path, options, token);
  } catch (error) {
    const shouldRetry =
      auth &&
      token !== null &&
      error instanceof ApiError &&
      error.status === 401 &&
      !isAuthEndpoint;
    if (!shouldRetry) throw error;

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      await clearSession();
      sessionExpiredHandler?.();
      throw error;
    }
    return performRequest<T>(path, options, refreshed);
  }
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const result = await request<T>(path, options);
  return result.data;
}

export function apiErrorFrom(
  error: unknown,
  fallback = "Terjadi kesalahan",
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
