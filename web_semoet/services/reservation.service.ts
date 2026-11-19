/** Endpoint /api/v1/reservations & /me/reservations — reservasi meja & event. */
import { api, request } from './client';

import type {
  AvailabilityResponse,
  CreateReservationPayload,
  Paginated,
  Reservation,
  ReservationCreated,
  ReservationHistory,
  ReservationMenuItem,
  ReservationRoom,
  ReservationStatus,
  ReservationTable,
} from '@/types/api';

export interface ListMyReservationsParams {
  page?: number;
  limit?: number;
  status?: ReservationStatus;
  upcomingOnly?: boolean;
}

export async function listMyReservations(
  params: ListMyReservationsParams = {},
): Promise<Paginated<Reservation>> {
  const res = await request<Reservation[]>('/me/reservations', {
    query: { limit: 20, ...params },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function createReservation(payload: CreateReservationPayload): Promise<ReservationCreated> {
  return api<ReservationCreated>('/reservations', { method: 'POST', body: payload, auth: true });
}

export interface ReservationDetail {
  reservation: Reservation;
  tables: ReservationTable[];
  menuItems: ReservationMenuItem[];
  history: ReservationHistory[];
}

export function getReservation(id: string): Promise<ReservationDetail> {
  return api<{
    reservation: Reservation;
    rooms?: ReservationRoom[];
    tables?: ReservationTable[];
    menuItems?: ReservationMenuItem[];
    history?: ReservationHistory[];
  }>(`/reservations/${id}`, { auth: true }).then(
    ({ reservation, rooms, tables, menuItems, history }) => {
      // Reservasi kini per-ruangan; jaga kompatibilitas bila backend hanya
      // mengirim `areaName`/`tableCodes` (reservasi lama).
      const areaName =
        reservation.areaName ?? rooms?.[0]?.name ?? tables?.find((t) => t.areaName)?.areaName ?? null;
      const tableCodes =
        reservation.tableCodes ??
        (tables ?? []).map((t) => t.tableCode).filter((c): c is string => Boolean(c));
      return {
        reservation: {
          ...reservation,
          areaName,
          rooms: rooms ?? reservation.rooms ?? [],
          menuItems: menuItems ?? reservation.menuItems ?? [],
          tableCodes,
        },
        tables: tables ?? [],
        menuItems: menuItems ?? reservation.menuItems ?? [],
        history: history ?? [],
      };
    },
  );
}

export function cancelReservation(id: string, reason?: string): Promise<Reservation> {
  return api<Reservation>(`/reservations/${id}/cancel`, {
    method: 'POST',
    body: { reason },
    auth: true,
  });
}

/** Tahap pembayaran DP reservasi. */
export type ReservationDepositStage = 'deposit' | 'deposit2' | 'settlement';

export interface ReservationDepositCharge {
  id: string;
  stage: ReservationDepositStage;
  status: string;
  amountIdr: number;
  paymentMethod: string;
  paymentUrl: string | null;
  expiresAt: string | null;
}

/**
 * Pelanggan membuat pembayaran DP untuk reservasinya sendiri lewat Midtrans.
 * Nominal dihitung sistem — tidak boleh dikirim dari klien.
 * Mengembalikan `paymentUrl` (Snap) yang bisa dibuka di browser.
 */
export function createReservationDepositCharge(
  reservationId: string,
  stage: ReservationDepositStage = 'deposit',
): Promise<{ payment: ReservationDepositCharge }> {
  return api<{ payment: ReservationDepositCharge }>(
    `/reservations/${reservationId}/deposit-charge`,
    {
      method: 'POST',
      body: { stage, paymentMethod: 'qris' },
      auth: true,
    },
  );
}

export interface DepositProofUploaded {
  stage: ReservationDepositStage;
  status: string;
  amountIdr: number;
  proofUrl: string;
  proofStorageKey: string;
}

/**
 * Pelanggan mengunggah bukti transfer untuk sebuah tahap DP (transfer bank
 * langsung). Bukti masuk sebagai `pending` — admin memverifikasi lalu menandai
 * lunas. Nominal dihitung sistem.
 */
export function uploadReservationDepositProof(
  reservationId: string,
  stage: ReservationDepositStage,
  data: string,
  opts: { contentType?: string; note?: string | null } = {},
): Promise<DepositProofUploaded> {
  return api<DepositProofUploaded>(`/reservations/${reservationId}/deposit-proof`, {
    method: 'POST',
    body: {
      stage,
      data,
      contentType: opts.contentType,
      note: opts.note ?? null,
    },
    auth: true,
  });
}

/** Cek ketersediaan meja — endpoint publik, tidak butuh login. */
export async function checkAvailability(params: {
  branchId: string;
  date?: string;
  guestCount?: number;
  areaId?: string;
}): Promise<AvailabilityResponse> {
  const res = await request<AvailabilityResponse>('/reservations/availability', {
    query: params,
    auth: false,
  });
  return res.data;
}
