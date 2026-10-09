import { Router } from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  updateMeSchema,
  updatePreferencesSchema,
} from '../validators/user.validator.js';

export const profileRouter = Router();

// Semua endpoint butuh auth
profileRouter.use(authenticate);

// GET /
profileRouter.get('/', asyncHandler(profileController.getMe));

// PATCH /
profileRouter.patch(
  '/',
  validate({ body: updateMeSchema }),
  asyncHandler(profileController.updateMe),
);

// GET /preferences
profileRouter.get('/preferences', asyncHandler(profileController.getPreferences));

// PATCH /preferences
profileRouter.patch(
  '/preferences',
  validate({ body: updatePreferencesSchema }),
  asyncHandler(profileController.updatePreferences),
);

// GET /tiers
profileRouter.get('/tiers', asyncHandler(profileController.getTiers));

// GET /tier
profileRouter.get('/tier', asyncHandler(profileController.getTiers));
