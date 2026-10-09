import { Router } from 'express';
import * as familyController from '../controllers/family.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  createFamilyMemberSchema,
  familyMemberIdParamSchema,
  updateFamilyMemberSchema,
  updateFamilySchema,
} from '../validators/user.validator.js';
import { listFavoriteQuerySchema } from '../validators/user.validator.js';

export const familyRouter = Router();

familyRouter.use(authenticate);

// GET /family
familyRouter.get('/family', asyncHandler(familyController.getFamily));

// PATCH /family
familyRouter.patch(
  '/family',
  validate({ body: updateFamilySchema }),
  asyncHandler(familyController.updateFamily),
);

// GET /family/members
familyRouter.get(
  '/family/members',
  validate({ query: listFavoriteQuerySchema }),
  asyncHandler(familyController.listMembers),
);

// POST /family/members
familyRouter.post(
  '/family/members',
  validate({ body: createFamilyMemberSchema }),
  asyncHandler(familyController.createMember),
);

// PATCH /family/members/:id
familyRouter.patch(
  '/family/members/:id',
  validate({ params: familyMemberIdParamSchema, body: updateFamilyMemberSchema }),
  asyncHandler(familyController.updateMember),
);

// DELETE /family/members/:id
familyRouter.delete(
  '/family/members/:id',
  validate({ params: familyMemberIdParamSchema }),
  asyncHandler(familyController.deleteMember),
);

// POST /family/members/:id/primary
familyRouter.post(
  '/family/members/:id/primary',
  validate({ params: familyMemberIdParamSchema }),
  asyncHandler(familyController.setPrimaryMember),
);
