import { db, type TransactionClient } from '../config/database.js';
import { camelizeRow, camelizeRows, toNumber } from '../utils/serialize.js';

/**
 * Executor = Pool (default) maupun transaksi. Semua repository menerima
 * `executor` opsional supaya bisa dipanggil di dalam withTransaction()
 * tanpa kehilangan atomisitas.
 */
export type Exec = TransactionClient;

/** Baris pertama (camelCase) atau null. */
export async function one<T = Record<string, unknown>>(
  executor: Exec,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await executor.query(text, params);
  if (result.rows.length === 0) return null;
  return camelizeRow<T>(result.rows[0]);
}

/** Semua baris (camelCase). */
export async function many<T = Record<string, unknown>>(
  executor: Exec,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await executor.query(text, params);
  return camelizeRows<T>(result.rows);
}

/** Nilai kolom pertama dari baris pertama. */
export async function scalar<T = unknown>(
  executor: Exec,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await executor.query(text, params);
  if (result.rows.length === 0) return null;
  const record = result.rows[0] as Record<string, unknown>;
  const key = Object.keys(record)[0];
  return (key ? record[key] : null) as T | null;
}

/** COUNT(*) sebagai number. */
export async function countRows(
  executor: Exec,
  text: string,
  params: unknown[] = [],
): Promise<number> {
  const value = await scalar<unknown>(executor, text, params);
  return toNumber(value, 0);
}

/** SELECT id FROM ... untuk dipakai insert batch. */
export async function ids<T = Record<string, unknown>>(
  executor: Exec,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return many<T>(executor, text, params);
}

export { db };

/** Executor default (langsung ke pool, di luar transaksi). */
export const ro: Exec = db;