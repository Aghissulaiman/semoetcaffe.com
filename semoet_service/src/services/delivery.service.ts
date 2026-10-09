import { withTransaction, db, type TransactionClient } from '../config/database.js';
import {
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  type DeliveryStatus,
  type OrderStatus,
} from '../config/constants.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors/AppError.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as deliveryRepo from '../repositories/delivery.repository.js';
import * as loyaltyRepo from '../repositories/loyalty.repository.js';
import * as orderRepo from '../repositories/order.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { pointsEarnedFromAmount } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import type { ListDeliveryQuery } from '../validators/delivery.validator.js';
import type {
  AssignDeliveryInput,
  DeliveryTrackingInput,
  UpdateDeliveryStatusInput,
} from '../validators/review.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/**
 * Transisi status pengiriman yang sah. Mirrors CHECK constraint
 * DELIVERY_STATUS di constants.ts.
 */
const DELIVERY_STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus[]> = {
  awaiting_assignment: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'in_transit', 'failed', 'cancelled'],
  picked_up: ['in_transit', 'delivered', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: ['assigned', 'picked_up', 'in_transit'],
  cancelled: [],
};

/** Status saat koordinat kurir masih relevan. */
const TRACKABLE_STATUS: DeliveryStatus[] = ['assigned', 'picked_up', 'in_transit'];

/** Prefix idempotensi poin dari order selesai. */
const POINTS_IDEMPOTENCY_PREFIX = 'order-completed:';

export interface AssignCourierRequest extends AssignDeliveryInput {
  orderId: string;
}

export interface DeliveryTrackingRequest extends DeliveryTrackingInput {
  orderId: string;
}

export interface UpdateDeliveryStatusRequest extends UpdateDeliveryStatusInput {
  orderId: string;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeDelivery(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    orderId: str(row.orderId),
    orderNumber: strOrNull(row.orderNumber),
    branchId: strOrNull(row.branchId),
    provider: strOrNull(row.provider),
    trackingCode: strOrNull(row.trackingCode),
    driverName: strOrNull(row.driverName),
    driverPhone: strOrNull(row.driverPhone),
    deliveryStatus: str(row.deliveryStatus),
    estimatedDeliveryAt: iso(row.estimatedDeliveryAt),
    deliveredAt: iso(row.deliveredAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeTracking(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    deliveryId: strOrNull(row.deliveryId),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    recordedAt: iso(row.recordedAt),
  };
}

function shapeOrderBrief(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: str(row.id),
    orderNumber: str(row.orderNumber),
    orderStatus: str(row.orderStatus),
    paymentStatus: str(row.paymentStatus),
    fulfillmentType: strOrNull(row.fulfillmentType),
    completedAt: iso(row.completedAt),
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

// --------------------------------------------------------------------------
// POST /orders/:orderId/delivery/assign
// --------------------------------------------------------------------------
export async function assignCourier(userId: string, input: AssignCourierRequest, isStaff: boolean) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat menugaskan kurir');

  const targetStatus = (input.deliveryStatus ?? 'assigned') as DeliveryStatus;
  if (targetStatus !== 'assigned') {
    throw badRequest('Saat assignment, status pengiriman hanya boleh assigned');
  }

  return withTransaction(async (tx) => {
    const order = await orderRepo.lockOrderById(input.orderId, tx);
    if (!order) throw notFound('Pesanan', input.orderId);

    const delivery = await deliveryRepo.lockDeliveryByOrder(input.orderId, tx);
    if (!delivery) {
      throw unprocessable(
        'Pesanan ini belum memiliki data pengiriman (hanya pesanan delivery yang punya data ini)',
      );
    }

    const current = str(delivery.deliveryStatus) as DeliveryStatus;
    if (current !== 'awaiting_assignment') {
      throw conflict(
        `Pengiriman sudah berstatus '${current}' sehingga kurir tidak bisa ditugaskan ulang`,
      );
    }

    // upsertDelivery menyimpan data kurir, updateDeliveryStatus menerapkan
    // transisi status (dan mengisi delivered_at saat sudah delivered).
    await deliveryRepo.upsertDelivery(
      {
        orderId: input.orderId,
        provider: input.provider,
        trackingCode: input.trackingCode ?? null,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        deliveryStatus: targetStatus,
        estimatedDeliveryAt: parseDate(input.estimatedDeliveryAt),
      },
      tx,
    );
    await deliveryRepo.updateDeliveryStatus(input.orderId, targetStatus, tx);

    const updated = await deliveryRepo.findDeliveryByOrder(input.orderId, tx);
    return {
      delivery: shapeDelivery(updated ?? delivery),
      order: shapeOrderBrief(order),
      previousDeliveryStatus: current,
    };
  });
}

// --------------------------------------------------------------------------
// POST /orders/:orderId/delivery/tracking
// --------------------------------------------------------------------------
export async function updateTracking(
  userId: string,
  input: DeliveryTrackingRequest,
  isStaff: boolean,
) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat memperbarui tracking pengiriman');

  const recordedAt = parseDate(input.recordedAt);

  return withTransaction(async (tx) => {
    const delivery = await deliveryRepo.lockDeliveryByOrder(input.orderId, tx);
    if (!delivery) throw notFound('Data pengiriman untuk pesanan ini');

    const current = str(delivery.deliveryStatus) as DeliveryStatus;
    if (!TRACKABLE_STATUS.includes(current)) {
      throw conflict(
        `Koordinat tidak bisa dicatat karena pengiriman sudah berstatus '${current}'`,
      );
    }

    const deliveryId = str(delivery.id);
    await deliveryRepo.insertTrackingLog(
      {
        deliveryId,
        latitude: input.latitude,
        longitude: input.longitude,
        recordedAt: recordedAt ?? undefined,
      },
      tx,
    );

    // Kurir yang sudah ambil pesanan otomatis menjadi picked_up lalu in_transit.
    const targetStatus = nextTrackingStatus(current);
    const advanced = targetStatus !== current;
    let orderStatus: string | null = null;

    if (advanced) {
      await deliveryRepo.updateDeliveryStatus(input.orderId, targetStatus, tx);
      if (targetStatus === 'in_transit') {
        orderStatus = await syncOrderToOutForDelivery(input.orderId, tx);
      }
    }

    const updated = await deliveryRepo.findDeliveryByOrder(input.orderId, tx);
    const latest = await deliveryRepo.latestTracking(deliveryId, tx);

    return {
      delivery: shapeDelivery(updated ?? delivery),
      previousDeliveryStatus: current,
      advanced,
      latestTracking: latest ? shapeTracking(latest) : null,
      orderStatus,
    };
  });
}

function nextTrackingStatus(current: DeliveryStatus): DeliveryStatus {
  if (current === 'assigned') return 'picked_up';
  if (current === 'picked_up') return 'in_transit';
  return current;
}

/** Order mengikuti kurir ke out_for_delivery bila transisinya memang diizinkan. */
async function syncOrderToOutForDelivery(
  orderId: string,
  tx: TransactionClient,
): Promise<string | null> {
  const order = await orderRepo.lockOrderById(orderId, tx);
  if (!order) return null;

  const current = str(order.orderStatus);
  if (!ORDER_STATUS.includes(current as OrderStatus)) return current;
  if (!ORDER_STATUS_FLOW[current as OrderStatus].includes('out_for_delivery')) return current;

  await orderRepo.updateOrderStatus(orderId, { orderStatus: 'out_for_delivery' }, tx);
  await orderRepo.insertStatusHistory(
    {
      orderId,
      fromStatus: current,
      toStatus: 'out_for_delivery',
      note: 'Pesanan dalam pengiriman oleh kurir',
    },
    tx,
  );
  return 'out_for_delivery';
}

// --------------------------------------------------------------------------
// PATCH /orders/:orderId/delivery/status
// --------------------------------------------------------------------------
export async function updateStatus(
  userId: string,
  input: UpdateDeliveryStatusRequest,
  isStaff: boolean,
) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat mengubah status pengiriman');

  const target = input.deliveryStatus as DeliveryStatus;

  return withTransaction(async (tx) => {
    const delivery = await deliveryRepo.lockDeliveryByOrder(input.orderId, tx);
    if (!delivery) throw notFound('Data pengiriman untuk pesanan ini');

    const current = str(delivery.deliveryStatus) as DeliveryStatus;

    // Request dengan status yang sama dianggap sukses agar aplikasi aman
    // mengirim ulang (retry) tanpa gagal.
    if (current === target) {
      const unchanged = await deliveryRepo.findDeliveryByOrder(input.orderId, tx);
      const order = await orderRepo.findOrderById(input.orderId, tx);
      return {
        delivery: shapeDelivery(unchanged ?? delivery),
        previousDeliveryStatus: current,
        changed: false,
        order: shapeOrderBrief(order),
        loyalty: null,
      };
    }

    const allowed = DELIVERY_STATUS_FLOW[current]?.includes(target) ?? false;
    if (!allowed) {
      throw unprocessable(
        `Status pengiriman tidak dapat berubah dari '${current}' ke '${target}'`,
      );
    }

    await deliveryRepo.updateDeliveryStatus(input.orderId, target, tx);

    let loyalty: LoyaltyEarnResult | null = null;

    if (target === 'delivered') {
      const completion = await completeDeliveredOrder(input.orderId, userId, input.note, tx);
      loyalty = completion.loyalty;
    }

    const updated = await deliveryRepo.findDeliveryByOrder(input.orderId, tx);
    const order = await orderRepo.findOrderById(input.orderId, tx);
    return {
      delivery: shapeDelivery(updated ?? delivery),
      previousDeliveryStatus: current,
      changed: true,
      order: shapeOrderBrief(order),
      loyalty,
    };
  });
}

/**
 * Pengiriman selesai: order menjadi completed (hanya bila ORDER_STATUS_FLOW
 * mengizinkan) lalu poin loyalty diberikan satu kali per order.
 */
async function completeDeliveredOrder(
  orderId: string,
  actorUserId: string,
  note: string | null | undefined,
  tx: TransactionClient,
) {
  const order = await orderRepo.lockOrderById(orderId, tx);
  if (!order) throw notFound('Pesanan', orderId);

  const current = str(order.orderStatus);
  if (current !== 'completed') {
    if (!ORDER_STATUS.includes(current as OrderStatus) || !ORDER_STATUS_FLOW[current as OrderStatus].includes('completed')) {
      throw unprocessable(
        `Status pesanan '${current}' tidak mengizinkan penyelesaian otomatis`,
      );
    }

    await orderRepo.updateOrderStatus(orderId, { orderStatus: 'completed', completedAt: true }, tx);
    await orderRepo.insertStatusHistory(
      {
        orderId,
        fromStatus: current,
        toStatus: 'completed',
        changedBy: actorUserId,
        note: note ?? 'Pesanan selesai diantar oleh kurir',
      },
      tx,
    );
  }

  const financials = (await orderRepo.getOrderFinancials(orderId, tx)) as unknown as Record<
    string,
    unknown
  >;
  const loyalty = await earnLoyaltyPoints(
    { orderId, userId: str(order.userId), totalIdr: num(financials?.totalIdr ?? financials?.total_idr) },
    tx,
  );

  const refreshed = await orderRepo.findOrderById(orderId, tx);
  return { order: refreshed ?? order, loyalty };
}

export interface LoyaltyEarnResult {
  pointsEarned: number;
  idempotent: boolean;
  lifetimePoints?: number;
  tier?: { code: string; name: string } | null;
  nextTier?: {
    code: string;
    name: string;
    minimumLifetimePoints: number;
    pointsToNextTier: number;
  } | null;
}

/** Poin sekali saja per order memakai idempotencyKey pada point_ledger. */
async function earnLoyaltyPoints(
  input: { orderId: string; userId: string; totalIdr: number },
  tx: TransactionClient,
): Promise<LoyaltyEarnResult> {
  const idempotencyKey = `${POINTS_IDEMPOTENCY_PREFIX}${input.orderId}`;

  const existing = await loyaltyRepo.findPointEntryByIdempotencyKey(idempotencyKey, tx);
  if (existing) {
    return { pointsEarned: num(existing.pointsDelta), idempotent: true };
  }

  const points = pointsEarnedFromAmount(input.totalIdr);
  if (points <= 0) return { pointsEarned: 0, idempotent: false };

  // Lock baris user supaya dua penyelesaian bersamaan tidak menimpa saldo.
  await loyaltyRepo.lockUserForPoints(input.userId, tx);
  await loyaltyRepo.insertPointEntry(
    {
      userId: input.userId,
      pointsDelta: points,
      mutationType: 'earn',
      description: `Poin dari pesanan yang selesai (${points} poin)`,
      referenceType: 'order',
      referenceId: input.orderId,
      idempotencyKey,
    },
    tx,
  );

  const tierInfo = await refreshCustomerTier(input.userId, tx);
  return {
    pointsEarned: points,
    idempotent: false,
    lifetimePoints: tierInfo.lifetimePoints,
    tier: tierInfo.tier,
    nextTier: tierInfo.nextTier,
  };
}

/**
 * Tier mengikuti total poin yang pernah didapat. Kolom tier_id berada di
 * customer_profiles (bukan users), jadi pembaruan memakai updateCustomerProfile.
 */
async function refreshCustomerTier(userId: string, tx: TransactionClient) {
  const summary = (await loyaltyRepo.getPointsSummary(userId, tx)) as unknown as Record<
    string,
    unknown
  >;
  const lifetimePoints = num(summary?.lifetimeEarned ?? summary?.lifetime_earned);

  const profile = await userRepo.findProfile(userId, tx);
  const currentTierId = strOrNull(profile?.tierId);

  const tiers = await userRepo.findTiers(tx);
  let activeTier: Record<string, unknown> | null = null;
  for (const row of tiers) {
    if (num(row.minimumLifetimePoints) <= lifetimePoints) activeTier = row;
  }

  if (activeTier && str(activeTier.id) !== currentTierId) {
    await authRepo.ensureCustomerProfile(userId, tx);
    await authRepo.updateCustomerProfile(userId, { tier_id: str(activeTier.id) }, tx);
  }

  // findNextTier dipakai untuk progress bar tier berikutnya di aplikasi.
  const nextTierRow = await userRepo.findNextTier(lifetimePoints, currentTierId, tx);

  return {
    lifetimePoints,
    tier: activeTier ? { code: str(activeTier.code), name: str(activeTier.name) } : null,
    nextTier: nextTierRow
      ? {
          code: str(nextTierRow.code),
          name: str(nextTierRow.name),
          minimumLifetimePoints: num(nextTierRow.minimumLifetimePoints),
          pointsToNextTier: Math.max(0, num(nextTierRow.minimumLifetimePoints) - lifetimePoints),
        }
      : null,
  };
}

// --------------------------------------------------------------------------
// GET /orders/:orderId/delivery
// --------------------------------------------------------------------------
export async function getDeliveryByOrder(orderId: string, userId: string, isStaff: boolean) {
  const order = isStaff
    ? await orderRepo.findOrderById(orderId)
    : await orderRepo.findOrderForUser(orderId, userId);
  if (!order) throw notFound('Pesanan', orderId);

  const delivery = await deliveryRepo.findDeliveryByOrder(orderId);
  if (!delivery) throw notFound('Data pengiriman untuk pesanan ini');

  const [trackingLogs, latest] = await Promise.all([
    deliveryRepo.listTrackingLogs(str(delivery.id)),
    deliveryRepo.latestTracking(str(delivery.id)),
  ]);

  return {
    delivery: shapeDelivery(delivery),
    order: shapeOrderBrief(order),
    trackingLogs: trackingLogs.map(shapeTracking),
    latestTracking: latest ? shapeTracking(latest) : null,
  };
}

// --------------------------------------------------------------------------
// GET /orders/:orderId/delivery/tracking
// --------------------------------------------------------------------------
export async function getTracking(
  orderId: string,
  userId: string,
  isStaff: boolean,
  pagination: Pagination,
) {
  const order = isStaff
    ? await orderRepo.findOrderById(orderId)
    : await orderRepo.findOrderForUser(orderId, userId);
  if (!order) throw notFound('Pesanan', orderId);

  const delivery = await deliveryRepo.findDeliveryByOrder(orderId);
  if (!delivery) throw notFound('Data pengiriman untuk pesanan ini');

  const trackingLogs = await deliveryRepo.listTrackingLogs(str(delivery.id), pagination.limit);

  return {
    trackingLogs: trackingLogs.map(shapeTracking),
    meta: buildPaginationMeta({ ...pagination, total: trackingLogs.length }),
  };
}

// --------------------------------------------------------------------------
// GET /deliveries
// --------------------------------------------------------------------------
export async function listDeliveries(query: ListDeliveryQuery, isStaff: boolean) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat melihat daftar pengiriman');

  const paging = parsePagination(query);
  const filters: deliveryRepo.DeliveryFilters = {
    deliveryStatus: query.deliveryStatus,
    branchId: query.branchId,
  };

  const rows = await deliveryRepo.listDeliveries(filters, paging);
  const total = await deliveryRepo.countDeliveries(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeDelivery), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /deliveries/active
// --------------------------------------------------------------------------
export async function listActiveDeliveries(branchId: string | undefined, isStaff: boolean) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat melihat daftar pengiriman aktif');

  const rows = await deliveryRepo.listActiveDeliveries(branchId);
  return rows.map((row) => ({
    ...shapeDelivery(row),
    customerName: strOrNull(row.customerName),
    recipientName: strOrNull(row.deliveryRecipientName),
    recipientPhone: strOrNull(row.deliveryRecipientPhone),
    address: (row.deliveryAddressSnapshot as Record<string, unknown> | null) ?? null,
  }));
}