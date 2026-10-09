/**
 * Konversi hasil query PostgreSQL (snake_case) menjadi bentuk API (camelCase).
 * Sengaja hanya satu level: nilai jsonb (preferences, rules, benefits, dll)
 * harus tetap apa adanya karena key-nya ditentukan aplikasi.
 */
export function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

export function camelizeRow<T = Record<string, unknown>>(row: unknown): T {
  if (row === null || row === undefined) return row as T;
  if (Array.isArray(row)) return row.map((item) => camelizeRow(item)) as unknown as T;
  if (typeof row !== 'object') return row as T;
  if (row instanceof Date || Buffer.isBuffer(row)) return row as T;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    result[camelizeKey(key)] = value;
  }
  return result as T;
}

export function camelizeRows<T = Record<string, unknown>>(rows: unknown[]): T[] {
  return rows.map((row) => camelizeRow<T>(row));
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBooleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 't' || value === 'true' || value === 1 || value === '1') return true;
  if (value === 'f' || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

export function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Alias pendek yang sering dipakai service saat shaping DTO.
export const str = (value: unknown, fallback = ''): string =>
  value === null || value === undefined ? fallback : String(value);

export const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const num = (value: unknown, fallback = 0): number => toNumber(value, fallback);

export const bool = (value: unknown, fallback = false): boolean => toBooleanOrNull(value) ?? fallback;

export const iso = (value: unknown): string | null => toIsoOrNull(value);

export const json = <T = Record<string, unknown>>(value: unknown, fallback: T): T =>
  value === null || value === undefined ? fallback : (value as T);

/** Buang field undefined supaya tidak masuk ke payload update. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value;
  }
  return output as Partial<T>;
}

/** Buang key dengan nilai null (dipakai saat update_partial). */
export function stripNulls<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) output[key] = value;
  }
  return output as Partial<T>;
}

/**
 * Query builder sederhana untuk INSERT ... ON CONFLICT DO UPDATE.
 * Menghindari string concat manual yang rawan salah kutip.
 */
export function buildUpsert(
  table: string,
  data: Record<string, unknown>,
  conflictColumns: string[],
  updateColumns: string[],
  extraOnConflict = '',
): { text: string; values: unknown[] } {
  const columns = Object.keys(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = updateColumns
    .filter((column) => columns.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const onConflict = [
    `ON CONFLICT (${conflictColumns.join(', ')})`,
    updates ? `DO UPDATE SET ${updates}` : 'DO NOTHING',
    extraOnConflict,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ${onConflict}`,
    values: columns.map((column) => data[column]),
  };
}