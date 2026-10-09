import { db, many, one, scalar, type Exec } from './base.js';

/** Kolom user yang boleh diekspos (tanpa password_hash). */
const USER_PUBLIC_COLUMNS = `
  u.id, u.email, u.phone_e164, u.display_name, u.status,
  u.email_verified_at, u.phone_verified_at, u.last_login_at,
  u.created_at, u.updated_at, u.deleted_at
`;

export interface InsertUserInput {
  email?: string | null;
  phoneE164?: string | null;
  displayName: string;
  passwordHash?: string | null;
  status?: string;
}

/**
 * Baris user yang dibaca dari database.
 *
 * PENTING: `one()` mengubah nama kolom snake_case menjadi camelCase, jadi
 * interface hasil baca WAJIB camelCase. Interface untuk payload tulis
 * (`InsertUserInput` dan sejenisnya) tetap snake_case karena itu nama kolom.
 */
export interface UserPublicRow {
  id: string;
  email: string | null;
  phoneE164: string | null;
  displayName: string;
  status: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface UserWithPasswordRow extends UserPublicRow {
  passwordHash: string | null;
}

export async function findUserById(userId: string, executor: Exec = db) {
  return one<UserPublicRow>(executor, `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [userId]);
}

export async function findUserByEmail(email: string, executor: Exec = db) {
  return one<UserWithPasswordRow>(
    executor,
    `SELECT ${USER_PUBLIC_COLUMNS}, u.password_hash
       FROM users u
      WHERE u.email = $1
        AND u.deleted_at IS NULL`,
    [email],
  );
}

export async function findUserByPhone(phoneE164: string, executor: Exec = db) {
  return one<UserWithPasswordRow>(
    executor,
    `SELECT ${USER_PUBLIC_COLUMNS}, u.password_hash
       FROM users u
      WHERE u.phone_e164 = $1
        AND u.deleted_at IS NULL`,
    [phoneE164],
  );
}

/** Login menerima email ATAU nomor telepon. */
export async function findUserByIdentifier(identifier: string, executor: Exec = db) {
  return one<UserWithPasswordRow>(
    executor,
    `SELECT ${USER_PUBLIC_COLUMNS}, u.password_hash
       FROM users u
      WHERE (u.email = $1 OR u.phone_e164 = $1)
        AND u.deleted_at IS NULL`,
    [identifier],
  );
}

/** Lock baris user supaya operasi pada sesi/profil tidak saling menimpa. */
export async function lockUserById(userId: string, executor: Exec) {
  return one<UserWithPasswordRow>(
    executor,
    `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1 FOR UPDATE`,
    [userId],
  );
}

export async function emailExists(email: string, executor: Exec = db): Promise<boolean> {
  const found = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`,
    [email],
  );
  return Boolean(found);
}

export async function phoneExists(phoneE164: string, executor: Exec = db): Promise<boolean> {
  const found = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM users WHERE phone_e164 = $1)`,
    [phoneE164],
  );
  return Boolean(found);
}

export async function insertUser(input: InsertUserInput, executor: Exec = db) {
  const { text, values } = buildInsert('users', {
    email: input.email ?? null,
    phone_e164: input.phoneE164 ?? null,
    display_name: input.displayName,
    password_hash: input.passwordHash ?? null,
    status: input.status ?? 'active',
  });

  return one(
    executor,
    `${text} RETURNING ${USER_PUBLIC_COLUMNS.replace(/u\./g, '')}`,
    values,
  );
}

export async function updatePasswordHash(userId: string, passwordHash: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE users
        SET password_hash = $2, updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [userId, passwordHash],
  );
}

export async function touchLastLogin(userId: string, executor: Exec = db) {
  await executor.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

export async function markEmailVerified(userId: string, executor: Exec = db) {
  await executor.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
    [userId],
  );
}

export async function markPhoneVerified(userId: string, executor: Exec = db) {
  await executor.query(
    `UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, now()) WHERE id = $1`,
    [userId],
  );
}

// --------------------------------------------------------------------------
// Roles & permissions
// --------------------------------------------------------------------------
export async function findRolesByUserId(userId: string, executor: Exec = db) {
  return many<{ code: string; name: string }>(
    executor,
    `SELECT r.code, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code`,
    [userId],
  );
}

export async function findPermissionsByUserId(userId: string, executor: Exec = db) {
  return many<{ resource: string; action: string }>(
    executor,
    `SELECT DISTINCT p.resource, p.action
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      ORDER BY p.resource, p.action`,
    [userId],
  );
}

export async function findRoleIdsByCodes(codes: string[], executor: Exec = db) {
  return many<{ id: string; code: string }>(
    executor,
    `SELECT id, code FROM roles WHERE code = ANY($1::text[])`,
    [codes],
  );
}

export async function findRoleIdsByPermissionKeys(keys: string[], executor: Exec = db) {
  if (keys.length === 0) return [];
  return many<{ id: string }>(
    executor,
    `SELECT p.id
       FROM permissions p
      WHERE (p.resource || ':' || p.action) = ANY($1::text[])`,
    [keys],
  );
}

// --------------------------------------------------------------------------
// Sessions (user_sessions)
// --------------------------------------------------------------------------
export interface InsertSessionInput {
  userId: string;
  refreshTokenHash: string;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
}

export async function insertSession(input: InsertSessionInput, executor: Exec = db) {
  const { text, values } = buildInsert('user_sessions', {
    user_id: input.userId,
    refresh_token_hash: input.refreshTokenHash,
    device_label: input.deviceLabel ?? null,
    ip_address: input.ipAddress ?? null,
    expires_at: input.expiresAt,
  });
  return one(executor, `${text} RETURNING id, created_at, expires_at`, values);
}

export async function findSessionByRefreshHash(refreshTokenHash: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, user_id, refresh_token_hash, device_label, ip_address, created_at, expires_at, revoked_at
       FROM user_sessions
      WHERE refresh_token_hash = $1`,
    [refreshTokenHash],
  );
}

/** Baris `user_sessions` (hasil baca sudah camelCase oleh `one()`/`many()`). */
export interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceLabel: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export async function lockSessionById(sessionId: string, executor: Exec) {
  return one<SessionRow>(
    executor,
    `SELECT id, user_id, refresh_token_hash, device_label, ip_address, created_at, expires_at, revoked_at
       FROM user_sessions
      WHERE id = $1
      FOR UPDATE`,
    [sessionId],
  );
}

/**
 * Refresh token hanya bisa disusun setelah sessionId diketahui (JWT berisi
 * sessionId), jadi session dibuat dulu dengan hash placeholder lalu di-update.
 */
export async function updateSessionRefreshHash(sessionId: string, refreshTokenHash: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE user_sessions SET refresh_token_hash = $2 WHERE id = $1 RETURNING id, expires_at`,
    [sessionId, refreshTokenHash],
  );
}

export async function revokeSession(sessionId: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
    [sessionId],
  );
}

export async function revokeAllUserSessions(userId: string, exceptSessionId: string | null, executor: Exec = db) {
  await executor.query(
    `UPDATE user_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, exceptSessionId],
  );
}

export async function listActiveSessions(userId: string, executor: Exec = db) {
  return many<SessionRow>(
    executor,
    `SELECT id, user_id, refresh_token_hash, device_label, ip_address, created_at, expires_at, revoked_at
       FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [userId],
  );
}

// --------------------------------------------------------------------------
// OAuth identities (auth_identities)
// --------------------------------------------------------------------------
/** Baris `auth_identities` (hasil baca sudah camelCase oleh `one()`). */
export interface AuthIdentityRow {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  providerEmail: string | null;
  createdAt: string;
}

export async function findAuthIdentity(provider: string, providerSubject: string, executor: Exec = db) {
  return one<AuthIdentityRow>(
    executor,
    `SELECT id, user_id, provider, provider_subject, provider_email, created_at
       FROM auth_identities
      WHERE provider = $1 AND provider_subject = $2`,
    [provider, providerSubject],
  );
}

export async function findAuthIdentityByUserAndProvider(userId: string, provider: string, executor: Exec = db) {
  return one<AuthIdentityRow>(
    executor,
    `SELECT id, user_id, provider, provider_subject, provider_email, created_at
       FROM auth_identities
      WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
}

export async function insertAuthIdentity(
  input: { userId: string; provider: string; providerSubject: string; providerEmail?: string | null },
  executor: Exec = db,
) {
  const { text, values } = buildInsert('auth_identities', {
    user_id: input.userId,
    provider: input.provider,
    provider_subject: input.providerSubject,
    provider_email: input.providerEmail ?? null,
  });
  return one(executor, `${text} RETURNING id, provider, provider_subject`, values);
}

// --------------------------------------------------------------------------
// OTP (otp_requests)
// --------------------------------------------------------------------------
export async function insertOtpRequest(
  input: {
    phoneE164: string;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
    requestIp?: string | null;
  },
  executor: Exec = db,
) {
  const { text, values } = buildInsert('otp_requests', {
    phone_e164: input.phoneE164,
    purpose: input.purpose,
    code_hash: input.codeHash,
    expires_at: input.expiresAt,
    request_ip: input.requestIp ?? null,
  });
  return one(executor, `${text} RETURNING id, requested_at, expires_at, attempts`, values);
}

/**
 * Baris OTP terbaru untuk kombinasi phone+purpose (untuk lock saat verify).
 *
 * `one()` mengubah nama kolom snake_case menjadi camelCase, jadi interface ini
 * WAJIB camelCase. Menulis snake_case di sini membuat pengecekan seperti
 * `request.code_hash` selalu `undefined` di runtime.
 */
export interface OtpRequestRow {
  id: string;
  phoneE164: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  requestedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  requestIp: string | null;
}

/** Baris OTP terbaru untuk kombinasi phone+purpose (untuk lock saat verify). */
export async function findLatestOtpRequest(phoneE164: string, purpose: string, executor: Exec) {
  return one<OtpRequestRow>(
    executor,
    `SELECT id, phone_e164, purpose, code_hash, attempts, requested_at, expires_at, consumed_at, request_ip
       FROM otp_requests
      WHERE phone_e164 = $1 AND purpose = $2
      ORDER BY requested_at DESC
      LIMIT 1
      FOR UPDATE`,
    [phoneE164, purpose],
  );
}

/** OTP kedaluwarsa bila `expires_at` sudah lewat dari sekarang. */
export function isOtpRequestExpired(row: OtpRequestRow, now: Date = new Date()): boolean {
  const expires = new Date(row.expiresAt).getTime();
  return Number.isFinite(expires) && expires <= now.getTime();
}

export async function consumeOtpRequest(otpRequestId: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE otp_requests SET consumed_at = now() WHERE id = $1 RETURNING id, consumed_at`,
    [otpRequestId],
  );
}

export async function incrementOtpAttempts(otpRequestId: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE otp_requests
        SET attempts = LEAST(attempts + 1, 10)
      WHERE id = $1
      RETURNING id, attempts`,
    [otpRequestId],
  );
}

/** Jangan sampai ada banyak OTP aktif bersamaan untuk satu nomor. */
export async function invalidateOpenOtpRequests(phoneE164: string, purpose: string, executor: Exec = db) {
  await executor.query(
    `UPDATE otp_requests
        SET consumed_at = now()
      WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [phoneE164, purpose],
  );
}

export async function countRecentOtpRequests(phoneE164: string, sinceMinutes: number, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM otp_requests
      WHERE phone_e164 = $1
        AND requested_at > now() - make_interval(mins => $2::int)`,
    [phoneE164, sinceMinutes],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Customer profile
// --------------------------------------------------------------------------
export async function ensureCustomerProfile(userId: string, executor: Exec = db) {
  const { text, values } = buildInsert('customer_profiles', { user_id: userId });
  await executor.query(
    `${text} ON CONFLICT (user_id) DO NOTHING`,
    values,
  );
}

export async function findCustomerProfile(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT user_id, tier_id, birth_date, marketing_opt_in, preferences, created_at, updated_at
       FROM customer_profiles
      WHERE user_id = $1`,
    [userId],
  );
}

export async function updateCustomerProfile(userId: string, data: Record<string, unknown>, executor: Exec = db) {
  const assignments = Object.keys(data)
    .map((column, index) => `${column} = $${index + 2}`)
    .join(', ');
  const values = Object.values(data);

  await executor.query(
    `UPDATE customer_profiles SET ${assignments}, updated_at = now() WHERE user_id = $1`,
    [userId, ...values],
  );
}

// --------------------------------------------------------------------------
// Helper INSERT builder (whitelist kolom di level caller)
// --------------------------------------------------------------------------
function buildInsert(table: string, data: Record<string, unknown>) {
  const columns = Object.keys(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values: columns.map((column) => data[column]),
  };
}