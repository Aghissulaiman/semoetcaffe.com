import { Router } from 'express';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate, requireActiveSession } from '../middlewares/authenticate.js';
import { authLimiter, otpLimiter, readLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  listSessionsQuery,
  loginSchema,
  logoutSchema,
  oauthSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

/**
 * Provider OAuth diambil dari path (/auth/oauth/:provider) dan divalidasi ulang
 * di sini supaya controller cukup mempercayai params yang sudah bersih.
 */
const oauthProviderParamSchema = z.object({ provider: z.enum(['google', 'apple']) });

export const authRouter = Router();

// POST /auth/register
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

// POST /auth/login
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

// POST /auth/logout - wajib sesi masih aktif supaya token dicabut sesuai perangkat.
authRouter.post(
  '/logout',
  authenticate,
  authLimiter,
  validate({ body: logoutSchema }),
  requireActiveSession,
  asyncHandler(authController.logout),
);

// POST /auth/refresh - rotasi refresh token (body atau cookie).
authRouter.post(
  '/refresh',
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh),
);

// GET /auth/sessions
authRouter.get(
  '/sessions',
  authenticate,
  readLimiter,
  validate({ query: listSessionsQuery }),
  asyncHandler(authController.listSessions),
);

// POST /auth/otp/request
authRouter.post(
  '/otp/request',
  otpLimiter,
  validate({ body: otpRequestSchema }),
  asyncHandler(authController.requestOtp),
);

// POST /auth/otp/verify
authRouter.post(
  '/otp/verify',
  otpLimiter,
  validate({ body: otpVerifySchema }),
  asyncHandler(authController.verifyOtp),
);

// POST /auth/password/forgot
authRouter.post(
  '/password/forgot',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);

// POST /auth/password/reset
authRouter.post(
  '/password/reset',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);

// PATCH /auth/password - hanya sesi yang sedang dipakai yang dipertahankan.
authRouter.patch(
  '/password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);

// POST /auth/oauth/:provider
authRouter.post(
  '/oauth/:provider',
  authLimiter,
  validate({ params: oauthProviderParamSchema, body: oauthSchema }),
  asyncHandler(authController.oauth),
);

// GET /auth/me
authRouter.get('/me', authenticate, asyncHandler(authController.getMe));