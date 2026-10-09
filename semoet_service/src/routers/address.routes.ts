import { Router } from 'express';
import * as addressController from '../controllers/address.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  addressIdParamSchema,
  createAddressSchema,
  listAddressQuerySchema,
  updateAddressSchema,
} from '../validators/user.validator.js';

export const addressRouter = Router();

addressRouter.use(authenticate);

// GET /addresses
addressRouter.get(
  '/addresses',
  validate({ query: listAddressQuerySchema }),
  asyncHandler(addressController.list),
);

// POST /addresses
addressRouter.post(
  '/addresses',
  validate({ body: createAddressSchema }),
  asyncHandler(addressController.create),
);

// GET /addresses/:id
addressRouter.get(
  '/addresses/:id',
  validate({ params: addressIdParamSchema }),
  asyncHandler(addressController.detail),
);

// PATCH /addresses/:id
addressRouter.patch(
  '/addresses/:id',
  validate({ params: addressIdParamSchema, body: updateAddressSchema }),
  asyncHandler(addressController.update),
);

// DELETE /addresses/:id
addressRouter.delete(
  '/addresses/:id',
  validate({ params: addressIdParamSchema }),
  asyncHandler(addressController.remove),
);

// POST /addresses/:id/default
addressRouter.post(
  '/addresses/:id/default',
  validate({ params: addressIdParamSchema }),
  asyncHandler(addressController.setDefault),
);
