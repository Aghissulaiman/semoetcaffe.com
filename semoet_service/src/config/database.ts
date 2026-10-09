import {
  Pool,
  types,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Monetary values dan kuantitas disimpan sebagai bigint / numeric.
 * Amount IDR selalu muat aman di Number (< 2^53), jadi kita parse ke number
 * supaya tidak ada konversi string manual di seluruh layer aplikasi.
 */
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));
types.setTypeParser(types.builtins.FLOAT8, (value) => Number.parseFloat(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  application_name: env.APP_NAME,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (error) => {
  logger.error({ err: error }, '[db] idle client error');
});

/** Antarmuka query minimal yang bisa dipakai Pool maupun transaksi. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export type TransactionClient = Queryable & {
  /** Row pertama atau null (bukan array). */
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null>;
  /** Semua row. */
  queryMany<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Satu nilai kolom pertama dari row pertama. */
  queryScalar<T = unknown>(text: string, params?: unknown[]): Promise<T | null>;
  /** Lock advisory level transaction: mencegah race pada kuota promo / gamifikasi. */
  advisoryLock(key: string): Promise<void>;
  client: PoolClient;
};

type RawQueryable = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult<never>>;
};

function instrument<T extends QueryResultRow = QueryResultRow>(
  executor: RawQueryable,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const run = (): Promise<QueryResult<T>> =>
    executor.query(text, params) as unknown as Promise<QueryResult<T>>;

  if (!env.DB_LOG_QUERIES) return run();

  const startedAt = process.hrtime.bigint();
  return run().then(
    (result) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.debug(
        { durationMs: Number(durationMs.toFixed(2)), rowCount: result.rowCount, sql: text },
        '[db] query',
      );
      return result;
    },
    (error: Error) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.error({ err: error, durationMs: Number(durationMs.toFixed(2)), sql: text }, '[db] query failed');
      throw error;
    },
  );
}

export const db: Queryable & TransactionClient = {
  client: pool as unknown as PoolClient,

  query: (text, params) => instrument(pool, text, params ?? []),

  async queryOne(text, params = []) {
    const result = await instrument(pool, text, params);
    return (result.rows[0] as never) ?? null;
  },

  async queryMany(text, params = []) {
    const result = await instrument(pool, text, params);
    return result.rows as never[];
  },

  async queryScalar(text, params = []) {
    const result = await instrument(pool, text, params);
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const keys = Object.keys(row);
    return (keys.length > 0 ? row[keys[0]] : null) as never;
  },

  advisoryLock: async (key: string) => {
    await instrument(pool, 'SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  },
};

/**
 * Menjalankan callback di dalam transaksi. Rollback otomatis bila callback throw.
 * Dipakai untuk operasi yang butuh atomik: pembuatan order, redeem poin,
 * klaim voucher, overlap reservasi, dan update status pembayaran.
 */
export async function withTransaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tx: TransactionClient = {
      client,
      query: (text, params) => instrument(client, text, params ?? []),
      async queryOne(text, params = []) {
        const result = await instrument(client, text, params);
        return (result.rows[0] as never) ?? null;
      },
      async queryMany(text, params = []) {
        const result = await instrument(client, text, params);
        return result.rows as never;
      },
      async queryScalar(text, params = []) {
        const result = await instrument(client, text, params);
        if (result.rows.length === 0) return null;
        const row = result.rows[0] as Record<string, unknown>;
        const keys = Object.keys(row);
        return (keys.length > 0 ? row[keys[0]] : null) as never;
      },
      async advisoryLock(key: string) {
        await instrument(client, 'SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      },
    };

    const result = await work(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: Error) => {
      logger.error({ err: rollbackError }, '[db] rollback failed');
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<void> {
  await db.queryScalar<{ now: string }>('SELECT now()::text AS now');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export type { PoolClient, QueryResult, QueryResultRow };