import { Router } from 'express';
import * as branchController from '../controllers/branch.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validate.js';
import {
  branchIdParamSchema,
  listBranchQuerySchema,
  listTableQuerySchema,
  tableQrParamSchema,
} from '../validators/catalog.validator.js';
import { uuidParamSchema } from '../validators/common.validator.js';

export const branchRouter = Router();

/** Endpoint publik (katalog lokasi) - tidak butuh login. */
branchRouter.get(
  '/branches',
  validate({ query: listBranchQuerySchema }),
  asyncHandler(branchController.list),
);

branchRouter.get(
  '/branches/:id',
  validate({ params: branchIdParamSchema }),
  asyncHandler(branchController.detail),
);

branchRouter.get(
  '/branches/:id/areas',
  validate({ params: branchIdParamSchema }),
  asyncHandler(branchController.areas),
);

branchRouter.get(
  '/branches/:id/tables',
  validate({ params: branchIdParamSchema, query: listTableQuerySchema }),
  asyncHandler(branchController.tables),
);

// GET /branches/:id/hours
branchRouter.get(
  '/branches/:id/hours',
  validate({ params: branchIdParamSchema }),
  asyncHandler(branchController.hours),
);

// /tables/qr/:token harus didaftarkan sebelum /tables/:id supaya
// "qr" tidak tertangkap sebagai id.
branchRouter.get(
  '/tables/qr/:token',
  validate({ params: tableQrParamSchema }),
  asyncHandler(branchController.tableByQr),
);

branchRouter.get(
  '/tables/:id',
  validate({ params: uuidParamSchema }),
  asyncHandler(branchController.tableDetail),
);