import { Router } from 'express';
import * as favoriteController from '../controllers/favorite.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  addFavoriteSchema,
  favoriteProductParamSchema,
  listFavoriteQuerySchema,
} from '../validators/user.validator.js';

export const favoriteRouter = Router();

favoriteRouter.use(authenticate);

// GET /favorites
favoriteRouter.get(
  '/favorites',
  validate({ query: listFavoriteQuerySchema }),
  asyncHandler(favoriteController.list),
);

// POST /favorites
favoriteRouter.post(
  '/favorites',
  validate({ body: addFavoriteSchema }),
  asyncHandler(favoriteController.add),
);

// DELETE /favorites/:productId
favoriteRouter.delete(
  '/favorites/:productId',
  validate({ params: favoriteProductParamSchema }),
  asyncHandler(favoriteController.remove),
);

// GET /favorites/ids
favoriteRouter.get('/favorites/ids', asyncHandler(favoriteController.ids));
