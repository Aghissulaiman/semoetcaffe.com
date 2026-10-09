import type { AuthContext } from './domain.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id per request, dipakai di log dan response. */
      requestId?: string;
      /** Diisi oleh middleware authenticate / optionalAuthenticate. */
      user?: AuthContext;
      /** Query string yang sudah divalidasi oleh middleware validate. */
      validatedQuery?: unknown;
      /** Body yang sudah divalidasi oleh middleware validate. */
      validatedBody?: unknown;
      /** Params yang sudah divalidasi oleh middleware validate. */
      validatedParams?: unknown;
      /** Idempotency-Key header (POST /orders, POST /payments/charge, dll). */
      idempotencyKey?: string;
      /** Raw body (Buffer) untuk route webhook, diisi oleh express.raw/captureRawJsonBody. */
      rawBody?: Buffer;
    }
  }
}

export {};