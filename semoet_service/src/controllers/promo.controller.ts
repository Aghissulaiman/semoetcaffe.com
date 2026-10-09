import type { Request, Response } from 'express';
import * as promoService from '../services/promo.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  ClaimVoucherInput,
  ListPromoQuery,
  ListVoucherQuery,
  ValidateVoucherInput,
} from '../validators/promo.validator.js';

// GET /promos (publik: daftar promo yang sedang bisa dipakai)
export async function listPromos(req: Request, res: Response): Promise<Response> {
  const result = await promoService.listPromos(getQuery<ListPromoQuery>(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /promos/:code (publik: detail promo beserta produk/kategori eligible)
export async function getPromoByCode(req: Request, res: Response): Promise<Response> {
  const { code } = getParams<{ code: string }>(req);
  const data = await promoService.getPromoByCode(code);
  return sendSuccess(res, data);
}

// GET /me/vouchers (voucher milik user yang sedang login)
export async function listVouchers(req: Request, res: Response): Promise<Response> {
  const result = await promoService.listVouchers(
    getUserId(req),
    getQuery<ListVoucherQuery>(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /me/vouchers/:id (detail voucher milik user yang sedang login)
export async function getVoucher(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await promoService.getVoucher(getUserId(req), id);
  return sendSuccess(res, data);
}

// POST /me/vouchers/claim (terbitkan voucher dari kode promo)
export async function claimVoucher(req: Request, res: Response): Promise<Response> {
  const data = await promoService.claimVoucher(getUserId(req), getBody<ClaimVoucherInput>(req));
  return sendCreated(res, data);
}

// POST /me/vouchers/validate (simulasi diskon sebelum checkout, tidak membakar voucher)
export async function validateVoucher(req: Request, res: Response): Promise<Response> {
  const data = await promoService.validateVoucher(getUserId(req), getBody<ValidateVoucherInput>(req));
  return sendSuccess(res, data);
}