import { Router } from 'express';
import * as promoController from '../controllers/promo.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  claimVoucherSchema,
  listPromoQuerySchema,
  listVoucherQuerySchema,
  promoCodeParamSchema,
  validateVoucherSchema,
  voucherIdParamSchema,
} from '../validators/promo.validator.js';

export const promoRouter = Router();

// GET /promos - katalog promo publik, tanpa autentikasi
promoRouter.get(
  '/promos',
  readLimiter,
  validate({ query: listPromoQuerySchema }),
  asyncHandler(promoController.listPromos),
);

// GET /promos/:code - detail promo publik, kode sudah dinormalisasi jadi huruf besar
promoRouter.get(
  '/promos/:code',
  readLimiter,
  validate({ params: promoCodeParamSchema }),
  asyncHandler(promoController.getPromoByCode),
);

// POST /me/vouchers/claim - klaim promo jadi voucher, terdaftar sebelum route :id
promoRouter.post(
  '/me/vouchers/claim',
  authenticate,
  writeLimiter,
  validate({ body: claimVoucherSchema }),
  asyncHandler(promoController.claimVoucher),
);

// POST /me/vouchers/validate - cek voucher sebelum checkout tanpa mengonsumsinya
promoRouter.post(
  '/me/vouchers/validate',
  authenticate,
  writeLimiter,
  validate({ body: validateVoucherSchema }),
  asyncHandler(promoController.validateVoucher),
);

// GET /me/vouchers - daftar voucher milik user yang login
promoRouter.get(
  '/me/vouchers',
  authenticate,
  readLimiter,
  validate({ query: listVoucherQuerySchema }),
  asyncHandler(promoController.listVouchers),
);

// GET /me/vouchers/:id - detail voucher milik user yang login
promoRouter.get(
  '/me/vouchers/:id',
  authenticate,
  readLimiter,
  validate({ params: voucherIdParamSchema }),
  asyncHandler(promoController.getVoucher),
);