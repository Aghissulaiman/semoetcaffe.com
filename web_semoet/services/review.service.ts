/** Endpoint /reviews & /me/reviews — ulasan pelanggan. */
import { api, request } from './client';

import type {
  CreateReviewPayload,
  MyReview,
  Paginated,
  UpdateReviewPayload,
} from '@/types/api';

export interface ListMyReviewsParams {
  page?: number;
  limit?: number;
}

export async function listMyReviews(
  params: ListMyReviewsParams = {},
): Promise<Paginated<MyReview>> {
  const res = await request<MyReview[]>('/me/reviews', {
    query: { limit: 50, ...params },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function createReview(payload: CreateReviewPayload): Promise<MyReview> {
  return api<MyReview>('/reviews', {
    method: 'POST',
    body: payload,
    auth: true,
  });
}

export function updateReview(id: string, payload: UpdateReviewPayload): Promise<MyReview> {
  return api<MyReview>(`/me/reviews/${id}`, {
    method: 'PATCH',
    body: payload,
    auth: true,
  });
}

export function deleteReview(id: string): Promise<void> {
  return api<void>(`/me/reviews/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}
