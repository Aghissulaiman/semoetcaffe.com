import 'dotenv/config';
import { z } from 'zod';

/** Menerima boolean dari string "1"/"true"/"yes"/"on" agar aman dipakai di .env */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  });

const intPositive = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('semoet-service'),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanish.default(true),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  DB_POOL_MAX: intPositive(20),
  DB_IDLE_TIMEOUT_MS: intPositive(30_000),
  DB_CONNECTION_TIMEOUT_MS: intPositive(5_000),
  DB_SSL: booleanish.default(false),
  DB_LOG_QUERIES: booleanish.default(false),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET minimal 32 karakter'),
  JWT_ACCESS_EXPIRES_IN: z.string().min(2).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET minimal 32 karakter'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(2).default('30d'),
  JWT_ISSUER: z.string().default('semoet-cafe'),
  JWT_AUDIENCE: z.string().default('semoet-mobile'),

  // Security
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  OTP_TTL_SECONDS: intPositive(300),
  OTP_MAX_ATTEMPTS: intPositive(5),
  PASSWORD_RESET_TTL_SECONDS: intPositive(3_600),
  REFRESH_COOKIE_NAME: z.string().default('semoet_refresh'),
  REFRESH_COOKIE_SECURE: booleanish.default(false),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: intPositive(60_000),
  RATE_LIMIT_MAX: intPositive(120),
  AUTH_RATE_LIMIT_MAX: intPositive(20),
  /** Kuota refresh token terpisah supaya refresh yang gagal tidak menghabiskan kuota login. */
  AUTH_REFRESH_LIMIT_MAX: intPositive(30),

  // Domain rules
  DEFAULT_TIMEZONE: z.string().default('Asia/Jakarta'),
  ORDER_NUMBER_PREFIX: z.string().default('SMO'),
  RESERVATION_PREFIX: z.string().default('RSV'),
  EVENT_BOOKING_PREFIX: z.string().default('EVT'),
  TAX_PERCENT: z.coerce.number().min(0).max(100).default(0),
  SERVICE_FEE_IDR: z.coerce.number().int().min(0).default(0),
  DELIVERY_FEE_IDR: z.coerce.number().int().min(0).default(0),
  POINTS_EARN_DIVISOR: z.coerce.number().int().positive().default(10_000),
  LOYALTY_EXPIRY_DAYS: z.coerce.number().int().positive().default(365),

  // Payment gateway (Midtrans)
  PAYMENT_PROVIDER_DEFAULT: z.string().default('midtrans'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('change-me-in-production'),
  MIDTRANS_MERCHANT_ID: z.string().default(''),
  MIDTRANS_CLIENT_KEY: z.string().default(''),
  MIDTRANS_SERVER_KEY: z.string().default(''),
  MIDTRANS_IS_PRODUCTION: booleanish.default(false),

  // AI assistant (endpoint OpenAI-compatible milik Gemini)
  AI_PROVIDER: z.string().default('gemini'),
  AI_MODEL: z.string().default('gemini-2.5-flash'),
  AI_API_KEY: z.string().optional(),
  AI_ASSISTANT_ENABLED: booleanish.default(true),
  AI_BASE_URL: z
    .string()
    .default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  AI_REQUEST_TIMEOUT_MS: intPositive(30_000),

  // Storage (Supabase)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_BUCKET_NAME: z.string().default('semoet-cafe'),
  STORAGE_PUBLIC_BASE_URL: z.string().default(''),

  // Seed bootstrap
  SEED_ADMIN_EMAIL: z.string().default('admin@semoetcafe.com'),
  SEED_ADMIN_PASSWORD: z.string().default('SemoetAdmin123!'),
  SEED_ADMIN_PHONE: z.string().default('+628111000999'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`[config] Konfigurasi environment tidak valid:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/** Daftar origin yang diizinkan untuk CORS. `*` = semua origin. */
export function getCorsOrigins(): string[] | '*' {
  if (env.CORS_ORIGINS.trim() === '*') return '*';
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}