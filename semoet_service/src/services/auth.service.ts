import { randomUUID } from 'node:crypto';
import { withTransaction, db, type TransactionClient } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  conflict,
  InternalServerError,
  NotFoundError,
  unauthorized,
  unprocessable,
  ValidationError,
} from '../errors/AppError.js';
import * as authRepo from '../repositories/auth.repository.js';
import type { OtpRequestRow, UserWithPasswordRow } from '../repositories/auth.repository.js';
import {
  assertPasswordStrength,
  comparePassword,
  hashPassword,
  normalizeEmail,
  normalizePhone,
} from '../utils/password.js';
import {
  buildTokenPair,
  hashToken,
  refreshTokenExpiryDate,
  verifyRefreshToken,
  type TokenPair,
} from '../utils/jwt.js';
import { generateNumericOtp, hashOtp, isOtpExpired, otpExpiresAt, verifyOtp as verifyOtpHash } from '../utils/otp.js';
import { randomToken } from '../utils/codeGenerator.js';
import { verifyOAuthIdToken } from '../utils/oauth.js';
import { logOtpForDevelopment, sendEmail, sendSms } from '../utils/notifier.js';
import type { AuthResult, SessionDevice } from '../types/domain.js';
import type {
  ChangePasswordInput,
  LoginInput,
  OAuthInput,
  OtpRequestInput,
  OtpVerifyInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validator.js';

const OTP_MAX_PER_15_MINUTES = 5;
/** Kolom otp_requests.attempts dibatasi 0..10 oleh CHECK constraint. */
const OTP_MAX_ATTEMPTS = Math.min(env.OTP_MAX_ATTEMPTS, 10);

function shapeUser(user: UserWithPasswordRow) {
  return {
    id: user.id,
    email: user.email,
    phoneE164: user.phoneE164,
    displayName: user.displayName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/**
 * Membuat sesi lalu menerbitkan pair token dalam satu transaksi.
 * Refresh token disimpan sebagai hash (user_sessions.refresh_token_hash)
 * sehingga pencabutan sesi berlaku seketika.
 */
async function issueSession(
  user: { id: string; email: string | null; phoneE164: string | null },
  device: SessionDevice,
  executor: TransactionClient,
): Promise<TokenPair> {
  const sessionId = randomUUID();
  // Hash placeholder dipakai supaya kolom NOT NULL UNIQUE terpenuhi, lalu
  // di-update setelah refresh token terbentuk (JWT butuh sessionId).
  const placeholderHash = randomToken(32);

  await authRepo.insertSession(
    {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: placeholderHash,
      deviceLabel: device.deviceLabel ?? null,
      ipAddress: device.ipAddress ?? null,
      expiresAt: refreshTokenExpiryDate(),
    },
    executor,
  );

  const roles = (await authRepo.findRolesByUserId(user.id, executor)).map((role) => role.code);
  const tokens = buildTokenPair({
    userId: user.id,
    sessionId,
    email: user.email,
    phone: user.phoneE164,
    roles,
  });

  await authRepo.updateSessionRefreshHash(sessionId, hashToken(tokens.refreshToken), executor);

  return tokens;
}

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes('@') ? normalizeEmail(trimmed) : normalizePhone(trimmed);
}

function isExpiredDate(value: Date | string): boolean {
  return new Date(value).getTime() <= Date.now();
}

// --------------------------------------------------------------------------
// POST /auth/register
// --------------------------------------------------------------------------
export async function register(input: RegisterInput, device: SessionDevice): Promise<AuthResult> {
  const email = input.email ? normalizeEmail(input.email) : null;
  const phoneE164 = input.phoneE164 ? normalizePhone(input.phoneE164) : null;

  assertPasswordStrength(input.password);

  if (email && (await authRepo.emailExists(email))) throw conflict('Email sudah terdaftar');
  if (phoneE164 && (await authRepo.phoneExists(phoneE164))) {
    throw conflict('Nomor telepon sudah terdaftar');
  }

  const passwordHash = await hashPassword(input.password);

  const result = await withTransaction(async (tx) => {
    const created = (await authRepo.insertUser(
      {
        email,
        phoneE164,
        displayName: input.displayName,
        passwordHash,
        status: 'active',
      },
      tx,
    )) as UserWithPasswordRow | null;

    if (!created) throw new InternalServerError('Gagal membuat user');

    await authRepo.ensureCustomerProfile(created.id, tx);

    const profileData: Record<string, unknown> = { marketing_opt_in: input.marketingOptIn ?? false };
    if (input.birthDate) profileData.birth_date = input.birthDate;
    await authRepo.updateCustomerProfile(created.id, profileData, tx);

    const tokens = await issueSession(created, device, tx);
    return { user: created, tokens };
  });

  logger.info({ userId: result.user.id }, '[auth] user registered');

  return { user: shapeUser(result.user), tokens: result.tokens, sessionId: '', isNewUser: true };
}

// --------------------------------------------------------------------------
// POST /auth/login
// --------------------------------------------------------------------------
export async function login(input: LoginInput, device: SessionDevice): Promise<AuthResult> {
  const user = (await authRepo.findUserByIdentifier(normalizeIdentifier(input.identifier))) as UserWithPasswordRow | null;

  if (!user) throw unauthorized('Email/nomor telepon atau password salah');
  if (user.status === 'suspended') {
    throw unauthorized('Akun sedang dinonaktifkan. Hubungi customer service.');
  }
  if (user.status === 'deleted' || user.deletedAt) throw unauthorized('Akun telah dihapus');

  if (!user.passwordHash) {
    throw unprocessable('Akun ini memakai login OTP atau social. Gunakan metode login yang sesuai.');
  }

  const valid = await comparePassword(input.password, String(user.passwordHash));
  if (!valid) throw unauthorized('Email/nomor telepon atau password salah');

  const tokens = await withTransaction(async (tx) => {
    await authRepo.touchLastLogin(user.id, tx);
    return issueSession(user, { ...device, deviceLabel: input.deviceLabel ?? device.deviceLabel }, tx);
  });

  return { user: shapeUser(user), tokens, sessionId: '', isNewUser: false };
}

// --------------------------------------------------------------------------
// POST /auth/logout
// --------------------------------------------------------------------------
export async function logout(
  userId: string,
  sessionId: string,
  allDevices: boolean,
): Promise<{ revoked: number }> {
  return withTransaction(async (tx) => {
    if (allDevices) {
      const active = await authRepo.listActiveSessions(userId, tx);
      await authRepo.revokeAllUserSessions(userId, null, tx);
      return { revoked: active.length };
    }

    const revoked = await authRepo.revokeSession(sessionId, tx);
    return { revoked: revoked ? 1 : 0 };
  });
}

export async function listSessions(userId: string) {
  const sessions = await authRepo.listActiveSessions(userId);
  return sessions.map((session) => ({
    id: session.id,
    deviceLabel: session.deviceLabel,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  }));
}

// --------------------------------------------------------------------------
// POST /auth/refresh (rotasi refresh token)
// --------------------------------------------------------------------------
export async function refresh(refreshToken: string | undefined, device: SessionDevice): Promise<AuthResult> {
  if (!refreshToken) throw unauthorized('Refresh token wajib diisi');

  const payload = verifyRefreshToken(refreshToken);
  const presentedHash = hashToken(refreshToken);

  return withTransaction(async (tx) => {
    const session = await authRepo.lockSessionById(payload.sessionId, tx);

    if (!session) throw unauthorized('Sesi tidak ditemukan, silakan login ulang');
    if (session.revokedAt) throw unauthorized('Sesi sudah diakhiri, silakan login ulang');
    if (isExpiredDate(String(session.expiresAt))) {
      throw unauthorized('Sesi kedaluwarsa, silakan login ulang');
    }

    if (session.refreshTokenHash !== presentedHash) {
      // Refresh token lama dipakai ulang -> indikasi token bocor: cabut semua sesi.
      logger.error(
        { userId: payload.userId, sessionId: payload.sessionId },
        '[auth] refresh token reuse detected',
      );
      await authRepo.revokeAllUserSessions(payload.userId, null, tx);
      throw unauthorized('Refresh token tidak valid. Semua sesi diakhiri.');
    }

    const user = (await authRepo.findUserById(payload.userId, tx)) as UserWithPasswordRow | null;
    if (!user) throw unauthorized('User tidak ditemukan');
    if (user.status === 'suspended' || user.deletedAt) throw unauthorized('Akun tidak aktif');

    await authRepo.revokeSession(String(session.id), tx);
    const tokens = await issueSession(user, device, tx);

    return { user: shapeUser(user), tokens, sessionId: '', isNewUser: false };
  });
}

// --------------------------------------------------------------------------
// POST /auth/otp/request
// --------------------------------------------------------------------------
export async function requestOtp(
  input: OtpRequestInput,
  requestIp: string | null,
): Promise<{ requestId: string | null; expiresAt: string | null; resendAfterSeconds: number }> {
  const phoneE164 = normalizePhone(input.phoneE164);

  const recent = await authRepo.countRecentOtpRequests(phoneE164, 15);
  if (recent >= OTP_MAX_PER_15_MINUTES) {
    throw unprocessable('Terlalu banyak permintaan OTP. Coba lagi dalam 15 menit.');
  }

  const code = generateNumericOtp();

  const request = (await withTransaction(async (tx) => {
    await authRepo.invalidateOpenOtpRequests(phoneE164, input.purpose, tx);
    return authRepo.insertOtpRequest(
      {
        phoneE164,
        purpose: input.purpose,
        codeHash: hashOtp(code),
        expiresAt: otpExpiresAt(),
        requestIp,
      },
      tx,
    );
  })) as OtpRequestRow | null;

  logOtpForDevelopment(phoneE164, code, input.purpose);

  const body = `Kode OTP Semoet: ${code}. Berlaku ${Math.round(env.OTP_TTL_SECONDS / 60)} menit. Jangan bagikan ke siapa pun.`;
  if (input.purpose === 'password_reset') {
    await sendEmail({ to: `${phoneE164}@semoet.local`, subject: 'Reset Password Semoet', body });
  } else {
    await sendSms({ to: phoneE164, body });
  }

  return {
    requestId: request?.id ?? null,
    expiresAt: request?.expiresAt ?? null,
    resendAfterSeconds: 60,
  };
}

// --------------------------------------------------------------------------
// POST /auth/otp/verify
// --------------------------------------------------------------------------
export type OtpVerifyResult =
  | { kind: 'authenticated'; data: AuthResult }
  | { kind: 'password_reset_verified'; identifier: string };

export async function verifyOtp(input: OtpVerifyInput, device: SessionDevice): Promise<OtpVerifyResult> {
  const phoneE164 = normalizePhone(input.phoneE164);

  return withTransaction(async (tx): Promise<OtpVerifyResult> => {
    // Kunci baris OTP supaya dua request dengan kode sama tidak bisa lolos bersamaan.
    const request = await authRepo.findLatestOtpRequest(phoneE164, input.purpose, tx);

    if (!request) throw unprocessable('Kode OTP tidak ditemukan. Silakan minta kode baru.');
    if (request.consumedAt) throw unprocessable('Kode OTP sudah dipakai. Silakan minta kode baru.');
    if (request.attempts >= OTP_MAX_ATTEMPTS) {
      throw unprocessable('Terlalu banyak percobaan. Silakan minta kode baru.');
    }
    if (isOtpExpired(String(request.expiresAt))) {
      throw unprocessable('Kode OTP sudah kedaluwarsa. Silakan minta kode baru.');
    }

    if (!verifyOtpHash(input.code, String(request.codeHash))) {
      await authRepo.incrementOtpAttempts(String(request.id), tx);
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - Number(request.attempts) - 1);
      throw unprocessable(`Kode OTP salah. Sisa percobaan: ${remaining}`);
    }

    await authRepo.consumeOtpRequest(String(request.id), tx);

    if (input.purpose === 'password_reset') {
      // OTP valid: client lanjut ke /auth/password/reset dengan kode yang sama.
      return { kind: 'password_reset_verified', identifier: phoneE164 };
    }

    let user = (await authRepo.findUserByPhone(phoneE164, tx)) as UserWithPasswordRow | null;
    let isNewUser = false;

    if (!user) {
      if (input.purpose === 'verify_phone') {
        throw unprocessable('Nomor telepon belum terdaftar. Silakan daftar terlebih dahulu.');
      }

      const displayName =
        input.displayName ??
        `Pelanggan ${phoneE164.slice(-4)}`;

      const created = (await authRepo.insertUser(
        { email: null, phoneE164, displayName, passwordHash: null, status: 'active' },
        tx,
      )) as UserWithPasswordRow | null;

      if (!created) throw new InternalServerError('Gagal membuat user');

      await authRepo.ensureCustomerProfile(created.id, tx);
      await authRepo.markPhoneVerified(created.id, tx);
      user = created;
      isNewUser = true;
    } else {
      await authRepo.markPhoneVerified(user.id, tx);
    }

    await authRepo.touchLastLogin(user.id, tx);
    const tokens = await issueSession(user, device, tx);

    return {
      kind: 'authenticated',
      data: { user: shapeUser(user), tokens, sessionId: '', isNewUser },
    };
  });
}

// --------------------------------------------------------------------------
// POST /auth/password/forgot
// --------------------------------------------------------------------------
export async function forgotPassword(
  identifier: string,
  requestIp: string | null,
): Promise<{ message: string }> {
  const normalized = normalizeIdentifier(identifier);
  // Response selalu sama supaya tidak membocorkan apakah data terdaftar.
  const genericMessage = 'Jika data terdaftar, kode OTP telah dikirim.';

  const user = await authRepo.findUserByIdentifier(normalized);
  if (!user) return { message: genericMessage };

  const code = generateNumericOtp();
  await withTransaction(async (tx) => {
    await authRepo.invalidateOpenOtpRequests(normalized, 'password_reset', tx);
    await authRepo.insertOtpRequest(
      {
        phoneE164: normalized,
        purpose: 'password_reset',
        codeHash: hashOtp(code),
        expiresAt: otpExpiresAt(),
        requestIp,
      },
      tx,
    );
  });

  logOtpForDevelopment(normalized, code, 'password_reset');
  await sendSms({ to: normalized, body: `Kode reset password Semoet: ${code}. Berlaku 5 menit.` });

  return { message: genericMessage };
}

// --------------------------------------------------------------------------
// POST /auth/password/reset
// --------------------------------------------------------------------------
export async function resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
  assertPasswordStrength(input.newPassword);

  const identifier = normalizeIdentifier(input.identifier);
  const passwordHash = await hashPassword(input.newPassword);

  return withTransaction(async (tx) => {
    const request = await authRepo.findLatestOtpRequest(identifier, 'password_reset', tx);

    if (!request) throw unprocessable('Kode OTP reset tidak ditemukan. Silakan minta kode baru.');
    if (request.consumedAt) throw unprocessable('Kode OTP reset sudah dipakai.');
    if (isOtpExpired(String(request.expiresAt))) {
      throw unprocessable('Kode OTP reset sudah kedaluwarsa. Silakan minta kode baru.');
    }
    if (!verifyOtpHash(input.code, String(request.codeHash))) {
      await authRepo.incrementOtpAttempts(String(request.id), tx);
      throw unprocessable('Kode OTP reset salah');
    }

    const user = (await authRepo.findUserByIdentifier(identifier, tx)) as UserWithPasswordRow | null;
    if (!user) throw unprocessable('Data tidak ditemukan');

    await authRepo.updatePasswordHash(user.id, passwordHash, tx);
    await authRepo.consumeOtpRequest(String(request.id), tx);
    await authRepo.revokeAllUserSessions(user.id, null, tx);

    logger.info({ userId: user.id }, '[auth] password reset success');

    return { message: 'Password berhasil diperbarui. Silakan login kembali.' };
  });
}

// --------------------------------------------------------------------------
// PATCH /auth/password (authenticated)
// --------------------------------------------------------------------------
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentSessionId: string,
): Promise<{ message: string; revokedSessions: number }> {
  assertPasswordStrength(input.newPassword);

  const user = (await authRepo.findUserById(userId)) as UserWithPasswordRow | null;
  if (!user) throw new NotFoundError('User', userId);
  if (!user.passwordHash) throw unprocessable('Akun ini tidak memiliki password');

  const valid = await comparePassword(input.currentPassword, String(user.passwordHash));
  if (!valid) throw unauthorized('Password saat ini salah');

  const passwordHash = await hashPassword(input.newPassword);

  const revokedSessions = await withTransaction(async (tx) => {
    await authRepo.updatePasswordHash(userId, passwordHash, tx);
    const active = await authRepo.listActiveSessions(userId, tx);
    await authRepo.revokeAllUserSessions(userId, currentSessionId, tx);
    return Math.max(0, active.length - 1);
  });

  return { message: 'Password berhasil diubah.', revokedSessions };
}

// --------------------------------------------------------------------------
// POST /auth/oauth/google | /auth/oauth/apple
// --------------------------------------------------------------------------
export async function loginWithOAuth(input: OAuthInput, device: SessionDevice): Promise<AuthResult> {
  const profile = await verifyOAuthIdToken(input.provider, input.idToken);

  return withTransaction(async (tx): Promise<AuthResult> => {
    const identity = await authRepo.findAuthIdentity(input.provider, profile.subject, tx);
    let user = identity
      ? ((await authRepo.findUserById(String(identity.userId), tx)) as UserWithPasswordRow | null)
      : null;
    let isNewUser = false;

    if (!user && profile.email) {
      const byEmail = (await authRepo.findUserByEmail(profile.email, tx)) as UserWithPasswordRow | null;
      if (byEmail) {
        // Akun sudah ada -> hubungkan identitas social ke akun itu.
        await authRepo.insertAuthIdentity(
          {
            userId: byEmail.id,
            provider: input.provider,
            providerSubject: profile.subject,
            providerEmail: profile.email,
          },
          tx,
        );
        user = byEmail;
      }
    }

    if (!user) {
      const rawName = profile.displayName ?? profile.email?.split('@')[0] ?? 'Pelanggan Semoet';
      const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      const created = (await authRepo.insertUser(
        {
          email: profile.emailVerified ? profile.email : null,
          phoneE164: null,
          displayName,
          passwordHash: null,
          status: 'active',
        },
        tx,
      )) as UserWithPasswordRow | null;

      if (!created) throw new InternalServerError('Gagal membuat user');

      await authRepo.ensureCustomerProfile(created.id, tx);
      await authRepo.insertAuthIdentity(
        {
          userId: created.id,
          provider: input.provider,
          providerSubject: profile.subject,
          providerEmail: profile.email,
        },
        tx,
      );

      user = created;
      isNewUser = true;
    } else {
      const existing = await authRepo.findAuthIdentityByUserAndProvider(user.id, input.provider, tx);
      if (!existing) {
        await authRepo.insertAuthIdentity(
          {
            userId: user.id,
            provider: input.provider,
            providerSubject: profile.subject,
            providerEmail: profile.email,
          },
          tx,
        );
      }
    }

    if (profile.emailVerified) await authRepo.markEmailVerified(user.id, tx);
    await authRepo.touchLastLogin(user.id, tx);

    const tokens = await issueSession(user, device, tx);
    return { user: shapeUser(user), tokens, sessionId: '', isNewUser };
  });
}

// --------------------------------------------------------------------------
// GET /auth/me
// --------------------------------------------------------------------------
export async function getAuthMe(userId: string) {
  const user = (await authRepo.findUserById(userId)) as UserWithPasswordRow | null;
  if (!user) throw new NotFoundError('User', userId);

  const [roles, permissions] = await Promise.all([
    authRepo.findRolesByUserId(userId),
    authRepo.findPermissionsByUserId(userId),
  ]);

  return {
    user: shapeUser(user),
    roles: roles.map((role) => ({ code: role.code, name: role.name })),
    permissions: permissions.map((permission) => `${permission.resource}:${permission.action}`),
  };
}

/** Refresh cookie helper: dipakai controller agar nama cookie terpusat. */
export const refreshCookieName = env.REFRESH_COOKIE_NAME;