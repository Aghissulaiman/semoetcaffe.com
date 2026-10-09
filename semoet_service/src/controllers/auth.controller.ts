import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { conflict, unprocessable } from '../errors/AppError.js';
import * as authService from '../services/auth.service.js';
import { refreshCookieName } from '../services/auth.service.js';
import { durationToSeconds } from '../utils/jwt.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import {
  getBody,
  getIp,
  getParams,
  getQuery,
  getUserAgent,
  getUserId,
} from '../utils/request.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  oauthSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type LogoutInput,
  type OAuthInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '../validators/auth.validator.js';

/** Max age cookie mengikuti TTL refresh token yang dikonfigurasi. */
const REFRESH_COOKIE_MAX_AGE_MS = durationToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000;

function buildRefreshCookieOptions(maxAgeMs: number) {
  const options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
    domain?: string;
  } = {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };

  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshCookieName, token, buildRefreshCookieOptions(REFRESH_COOKIE_MAX_AGE_MS));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, buildRefreshCookieOptions(0));
}

// --------------------------------------------------------------------------
// POST /register
// --------------------------------------------------------------------------
export async function register(req: Request, res: Response): Promise<Response> {
  const body = getBody<RegisterInput>(req);
  const device = {
    deviceLabel: body.deviceLabel as string | undefined,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  };

  const result = await authService.register(body, device);
  if (result.tokens?.refreshToken) {
    setRefreshCookie(res, result.tokens.refreshToken);
  }

  return sendCreated(res, {
    user: result.user,
    accessToken: result.tokens?.accessToken,
    expiresIn: result.tokens?.accessTokenExpiresIn,
    tokenType: result.tokens?.tokenType,
    isNewUser: result.isNewUser,
  });
}

// --------------------------------------------------------------------------
// POST /login
// --------------------------------------------------------------------------
export async function login(req: Request, res: Response): Promise<Response> {
  const body = getBody<LoginInput>(req);
  const device = {
    deviceLabel: body.deviceLabel,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  };

  const result = await authService.login(body, device);
  if (result.tokens?.refreshToken) {
    setRefreshCookie(res, result.tokens.refreshToken);
  }

  return sendSuccess(res, {
    user: result.user,
    accessToken: result.tokens?.accessToken,
    expiresIn: result.tokens?.accessTokenExpiresIn,
    tokenType: result.tokens?.tokenType,
    isNewUser: result.isNewUser,
  });
}

// --------------------------------------------------------------------------
// POST /logout
// --------------------------------------------------------------------------
export async function logout(req: Request, res: Response): Promise<Response> {
  const body = getBody<LogoutInput>(req);
  const userId = getUserId(req);
  const sessionId = req.user?.sessionId;

  if (!sessionId) {
    clearRefreshCookie(res);
    return sendSuccess(res, { revoked: 0 });
  }

  const allDevices = Boolean(body.allDevices);
  const result = await authService.logout(userId, sessionId, allDevices);

  clearRefreshCookie(res);

  return sendSuccess(res, { revoked: result.revoked, allDevices });
}

// --------------------------------------------------------------------------
// POST /refresh
// --------------------------------------------------------------------------
export async function refresh(req: Request, res: Response): Promise<Response> {
  const body = getBody<RefreshInput>(req);
  const tokenFromBody = body.refreshToken;
  const tokenFromCookie = req.cookies?.[refreshCookieName] as string | undefined;
  const refreshToken = tokenFromBody || tokenFromCookie;

  const device = {
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  };

  const result = await authService.refresh(refreshToken, device);
  if (result.tokens?.refreshToken) {
    setRefreshCookie(res, result.tokens.refreshToken);
  }

  return sendSuccess(res, {
    user: result.user,
    accessToken: result.tokens?.accessToken,
    expiresIn: result.tokens?.accessTokenExpiresIn,
    tokenType: result.tokens?.tokenType,
  });
}

// --------------------------------------------------------------------------
// GET /sessions
// --------------------------------------------------------------------------
export async function listSessions(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const sessions = await authService.listSessions(userId);
  return sendSuccess(res, { sessions });
}

// --------------------------------------------------------------------------
// POST /otp/request
// --------------------------------------------------------------------------
export async function requestOtp(req: Request, res: Response): Promise<Response> {
  const body = getBody<OtpRequestInput>(req);
  const ip = getIp(req);

  const result = await authService.requestOtp(body, ip);
  return sendSuccess(res, result);
}

// --------------------------------------------------------------------------
// POST /otp/verify
// --------------------------------------------------------------------------
export async function verifyOtp(req: Request, res: Response): Promise<Response> {
  const body = getBody<OtpVerifyInput>(req);
  const device = {
    deviceLabel: body.deviceLabel,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  };

  const result = await authService.verifyOtp(body, device);

  if (result.kind === 'authenticated') {
    const data = result.data;
    if (data.tokens?.refreshToken) {
      setRefreshCookie(res, data.tokens.refreshToken);
    }
    return sendSuccess(res, {
      kind: 'authenticated',
      user: data.user,
      accessToken: data.tokens?.accessToken,
      expiresIn: data.tokens?.accessTokenExpiresIn,
      tokenType: data.tokens?.tokenType,
      isNewUser: data.isNewUser,
    });
  }

  return sendSuccess(res, {
    kind: 'password_reset_verified',
    identifier: result.identifier,
  });
}

// --------------------------------------------------------------------------
// POST /password/forgot
// --------------------------------------------------------------------------
export async function forgotPassword(req: Request, res: Response): Promise<Response> {
  const body = getBody<ForgotPasswordInput>(req);
  const ip = getIp(req);
  const result = await authService.forgotPassword(body.identifier, ip);
  return sendSuccess(res, result);
}

// --------------------------------------------------------------------------
// POST /password/reset
// --------------------------------------------------------------------------
export async function resetPassword(req: Request, res: Response): Promise<Response> {
  const body = getBody<ResetPasswordInput>(req);
  const result = await authService.resetPassword(body);
  return sendSuccess(res, result);
}

// --------------------------------------------------------------------------
// PATCH /password
// --------------------------------------------------------------------------
export async function changePassword(req: Request, res: Response): Promise<Response> {
  const body = getBody<ChangePasswordInput>(req);
  const userId = getUserId(req);
  const sessionId = req.user?.sessionId;

  if (!sessionId) {
    throw conflict('Sesi tidak ditemukan');
  }

  const result = await authService.changePassword(userId, body, sessionId);
  return sendSuccess(res, result);
}

// --------------------------------------------------------------------------
// POST /oauth/:provider
// --------------------------------------------------------------------------
export async function oauth(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ provider: 'google' | 'apple' }>(req);
  const body = getBody<OAuthInput>(req);

  const provider = params.provider ?? body.provider;
  if (provider !== 'google' && provider !== 'apple') {
    throw unprocessable('Provider OAuth tidak valid');
  }

  const device = {
    deviceLabel: body.deviceLabel,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  };

  const input: OAuthInput = {
    provider,
    idToken: body.idToken,
    deviceLabel: body.deviceLabel,
  };

  const result = await authService.loginWithOAuth(input, device);
  if (result.tokens?.refreshToken) {
    setRefreshCookie(res, result.tokens.refreshToken);
  }

  return sendSuccess(res, {
    user: result.user,
    accessToken: result.tokens?.accessToken,
    expiresIn: result.tokens?.accessTokenExpiresIn,
    tokenType: result.tokens?.tokenType,
    isNewUser: result.isNewUser,
  });
}

// --------------------------------------------------------------------------
// GET /me (auth)
export async function getMe(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const data = await authService.getAuthMe(userId);
  return sendSuccess(res, data);
}

// Validators export for router
export const authValidators = {
  registerSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  otpRequestSchema,
  otpVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  oauthSchema: z.object({
    params: z.object({ provider: z.enum(['google', 'apple']) }),
    body: oauthSchema,
  }),
};