import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const REVIEW_COLUMNS = `
  r.id, r.user_id, r.order_item_id, r.product_id, r.food_rating, r.service_rating,
  r.speed_rating, r.review_text, r.moderation_status, r.created_at, r.updated_at
`;

export async function listProductReviews(
  productId: string,
  filters: { minRating?: number; sort: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${REVIEW_COLUMNS},
            u.display_name AS user_name,
            oi.product_name_snapshot, oi.variant_name_snapshot,
            COALESCE((r.food_rating + COALESCE(r.service_rating, r.food_rating) + COALESCE(r.speed_rating, r.food_rating)) / 3.0, 0) AS average_rating
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN order_items oi ON oi.id = r.order_item_id
      WHERE r.product_id = $1
        AND r.moderation_status = 'visible'
        AND ($2::smallint IS NULL OR COALESCE(r.food_rating, 0) >= $2)
      ORDER BY
        ${filters.sort === 'rating_desc' ? 'average_rating DESC, r.created_at DESC' : filters.sort === 'rating_asc' ? 'average_rating ASC, r.created_at DESC' : 'r.created_at DESC'}
      ${paginationSql(pagination)}`,
    [productId, filters.minRating ?? null],
  );
}

export async function countProductReviews(productId: string, minRating?: number, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM reviews
      WHERE product_id = $1
        AND moderation_status = 'visible'
        AND ($2::smallint IS NULL OR COALESCE(food_rating, 0) >= $2)`,
    [productId, minRating ?? null],
  );
  return Number(value ?? 0);
}

export async function getProductRatingSummary(productId: string, executor: Exec = db) {
  return one<{
    averageFood: number;
    averageService: number;
    averageSpeed: number;
    averageOverall: number;
    reviewCount: number;
  }>(
    executor,
    `SELECT
        ROUND(AVG(food_rating)::numeric, 2) AS average_food,
        ROUND(AVG(service_rating)::numeric, 2) AS average_service,
        ROUND(AVG(speed_rating)::numeric, 2) AS average_speed,
        ROUND(AVG((food_rating + COALESCE(service_rating, food_rating) + COALESCE(speed_rating, food_rating)) / 3.0)::numeric, 2) AS average_overall,
        COUNT(*)::int AS review_count
       FROM reviews
      WHERE product_id = $1 AND moderation_status = 'visible'`,
    [productId],
  );
}

/** Ownership dijamin lewat JOIN ke orders (satu review per order item). */
export async function insertReview(
  input: {
    userId: string;
    orderItemId: string;
    productId: string | null;
    foodRating?: number;
    serviceRating?: number;
    speedRating?: number;
    reviewText?: string | null;
  },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO reviews (user_id, order_item_id, product_id, food_rating, service_rating, speed_rating, review_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${REVIEW_COLUMNS}`,
    [
      input.userId,
      input.orderItemId,
      input.productId,
      input.foodRating ?? null,
      input.serviceRating ?? null,
      input.speedRating ?? null,
      input.reviewText ?? null,
    ],
  );
}

export async function reviewExistsForOrderItem(orderItemId: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM reviews WHERE order_item_id = $1)`,
    [orderItemId],
  );
  return Boolean(value);
}

export async function findReviewById(reviewId: string, executor: Exec = db) {
  return one(executor, `SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.id = $1`, [reviewId]);
}

export async function findReviewForUser(reviewId: string, userId: string, executor: Exec = db) {
  return one(executor, `SELECT ${REVIEW_COLUMNS} FROM reviews r WHERE r.id = $1 AND r.user_id = $2`, [
    reviewId,
    userId,
  ]);
}

export async function updateReview(
  reviewId: string,
  userId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  return one(
    executor,
    `UPDATE reviews SET ${assignments}, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${REVIEW_COLUMNS}`,
    [reviewId, userId, ...Object.values(data)],
  );
}

export async function deleteReview(reviewId: string, userId: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id`,
    [reviewId, userId],
  );
  return Boolean(row);
}

export async function listReviewsByUser(userId: string, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${REVIEW_COLUMNS},
            oi.product_name_snapshot, oi.variant_name_snapshot,
            o.order_number, o.placed_at,
            p.slug AS product_slug
       FROM reviews r
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = r.product_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      ${paginationSql(pagination)}`,
    [userId],
  );
}

export async function countReviewsByUser(userId: string, executor: Exec = db) {
  const value = await scalar<number>(executor, `SELECT COUNT(*)::int FROM reviews WHERE user_id = $1`, [
    userId,
  ]);
  return Number(value ?? 0);
}

export async function moderateReview(
  reviewId: string,
  moderationStatus: string,
  executor: Exec = db,
) {
  return one(
    executor,
    `UPDATE reviews SET moderation_status = $2, updated_at = now() WHERE id = $1 RETURNING ${REVIEW_COLUMNS}`,
    [reviewId, moderationStatus],
  );
}