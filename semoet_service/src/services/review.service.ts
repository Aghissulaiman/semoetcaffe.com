import { withTransaction } from '../config/database.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as orderRepo from '../repositories/order.repository.js';
import * as reviewRepo from '../repositories/review.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { compact, num, str, strOrNull, toIsoOrNull } from '../utils/serialize.js';
import type { ListProductReviewQuery } from '../validators/catalog.validator.js';
import type { CreateReviewInput, ListMyReviewQuery } from '../validators/review.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/**
 * Generic eksplisit di repository masih ditulis dengan nama kolom snake_case,
 * padahal baris runtime selalu di-camelize oleh `one()`. Karena itu baris
 * di-cast ke bentuk camelCase di sini, bukan snake_case.
 */
type RatingSummaryRow = Record<string, unknown>;

/**
 * Body PATCH /me/reviews/:id. Skema partial dibuat di router karena validator
 * review hanya menyediakan skema create dan moderasi.
 */
export interface UpdateReviewInput {
  foodRating?: number;
  serviceRating?: number;
  speedRating?: number;
  reviewText?: string | null;
}

/** Bentuk update untuk repository: nama kolom harus snake_case. */
interface ReviewUpdateData extends Record<string, unknown> {
  food_rating?: number | null;
  service_rating?: number | null;
  speed_rating?: number | null;
  review_text?: string | null;
  moderation_status?: string;
}

function shapeSummary(row: RatingSummaryRow | null) {
  return {
    average: row ? num(row.averageOverall) : 0,
    food: row ? num(row.averageFood) : 0,
    service: row ? num(row.averageService) : 0,
    speed: row ? num(row.averageSpeed) : 0,
    count: row ? num(row.reviewCount) : 0,
  };
}

/** Baris review sudah di-camelCase oleh repository (rata-rata dihitung DB). */
function shapeReview(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.userId ?? ''),
    userName: strOrNull(row.userName),
    productId: row.productId === null || row.productId === undefined ? null : String(row.productId),
    orderItemId: strOrNull(row.orderItemId),
    productName: strOrNull(row.productNameSnapshot),
    variantName: strOrNull(row.variantNameSnapshot),
    foodRating: row.foodRating === null || row.foodRating === undefined ? null : num(row.foodRating),
    serviceRating: row.serviceRating === null || row.serviceRating === undefined ? null : num(row.serviceRating),
    speedRating: row.speedRating === null || row.speedRating === undefined ? null : num(row.speedRating),
    averageRating: num(row.averageRating),
    text: strOrNull(row.reviewText),
    createdAt: toIsoOrNull(row.createdAt),
  };
}

/** Versi milik user: menambah status moderasi dan konteks pesanan. */
function shapeMyReview(row: Record<string, unknown>) {
  return {
    ...shapeReview(row),
    moderationStatus: strOrNull(row.moderationStatus),
    orderNumber: strOrNull(row.orderNumber),
    productSlug: strOrNull(row.productSlug),
    orderPlacedAt: toIsoOrNull(row.placedAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

/**
 * Daftar review publik untuk satu produk beserta ringkasan rating.
 * Hanya review dengan moderasi "visible" yang dikembalikan oleh repository.
 */
export async function listProductReviews(
  productId: string,
  query: ListProductReviewQuery,
): Promise<Paginated<unknown> & { rating: ReturnType<typeof shapeSummary> }> {
  const paging = parsePagination(query);
  const filters = { minRating: query.minRating, sort: query.sort };

  const rows = await reviewRepo.listProductReviews(productId, filters, paging);
  const total = await reviewRepo.countProductReviews(productId, query.minRating);
  const summary = (await reviewRepo.getProductRatingSummary(
    productId,
  )) as RatingSummaryRow | null;

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return {
    items: rows.map(shapeReview),
    meta: buildPaginationMeta(pagination),
    rating: shapeSummary(summary),
  };
}

// --------------------------------------------------------------------------
// POST /reviews
// --------------------------------------------------------------------------
export async function createReview(userId: string, input: CreateReviewInput) {
  return withTransaction(async (tx) => {
    // Order item hanya ditemukan bila memang milik user ini, jadi item milik
    // orang lain otomatis tidak bocor lewat pesan error.
    const orderItem = await orderRepo.findOrderItemForUser(input.orderItemId, userId, tx);
    if (!orderItem) throw notFound('Item pesanan', input.orderItemId);

    if (str(orderItem.orderStatus) !== 'completed') {
      throw unprocessable('Review hanya bisa ditulis untuk pesanan yang sudah selesai');
    }

    const alreadyReviewed = await reviewRepo.reviewExistsForOrderItem(input.orderItemId, tx);
    if (alreadyReviewed) {
      throw conflict('Item pesanan ini sudah pernah direview');
    }

    const row = await reviewRepo.insertReview(
      {
        userId,
        orderItemId: input.orderItemId,
        productId: strOrNull(orderItem.productId),
        foodRating: input.foodRating,
        serviceRating: input.serviceRating,
        speedRating: input.speedRating,
        reviewText: input.reviewText ?? null,
      },
      tx,
    );

    if (!row) throw notFound('Item pesanan', input.orderItemId);
    return shapeMyReview(row);
  });
}

// --------------------------------------------------------------------------
// GET /me/reviews
// --------------------------------------------------------------------------
export async function listMyReviews(
  userId: string,
  query: ListMyReviewQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);

  const rows = await reviewRepo.listReviewsByUser(userId, paging);
  const total = await reviewRepo.countReviewsByUser(userId);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeMyReview), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// PATCH /me/reviews/:id
// --------------------------------------------------------------------------
export async function updateReview(userId: string, reviewId: string, input: UpdateReviewInput) {
  return withTransaction(async (tx) => {
    // Ownership dicek lewat query yang sudah memfilter user_id.
    const current = await reviewRepo.findReviewForUser(reviewId, userId, tx);
    if (!current) throw notFound('Review', reviewId);

    const data: ReviewUpdateData = compact({
      food_rating: input.foodRating,
      service_rating: input.serviceRating,
      speed_rating: input.speedRating,
      review_text: input.reviewText,
    }) as ReviewUpdateData;

    // Gabungan rating lama dan baru harus tetap memenuhi CHECK constraint:
    // minimal satu rating wajib terisi.
    const merged = {
      food: input.foodRating ?? nullableNumber(current.foodRating),
      service: input.serviceRating ?? nullableNumber(current.serviceRating),
      speed: input.speedRating ?? nullableNumber(current.speedRating),
    };
    if (merged.food === null && merged.service === null && merged.speed === null) {
      throw badRequest('Minimal satu rating (makanan, pelayanan, atau kecepatan) harus tetap terisi');
    }

    // Review yang disembunyikan atau ditandai moderasi kembali tampil setelah
    // pemiliknya memperbarui isinya.
    if (current.moderationStatus !== 'visible') {
      data.moderation_status = 'visible';
    }

    const updated = await reviewRepo.updateReview(reviewId, userId, data, tx);
    if (!updated) throw notFound('Review', reviewId);

    return shapeMyReview(updated);
  });
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

// --------------------------------------------------------------------------
// DELETE /me/reviews/:id
// --------------------------------------------------------------------------
export async function deleteReview(userId: string, reviewId: string): Promise<void> {
  return withTransaction(async (tx) => {
    const deleted = await reviewRepo.deleteReview(reviewId, userId, tx);
    if (!deleted) throw notFound('Review', reviewId);
  });
}