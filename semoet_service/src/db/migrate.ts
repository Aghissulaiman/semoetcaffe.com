/**
 * Migrasi skema database.
 *
 * Skema baseline ada di `src/db/schema.sql` (satu file untuk fresh install).
 * Script ini aman dijalankan berulang: seluruh DDL memakai `IF NOT EXISTS`,
 * `CREATE OR REPLACE`, atau `ON CONFLICT`, jadi `db:migrate` bisa dipanggil
 * setiap kali tanpa efek samping yang merusak.
 *
 * Jalankan: npm run db:migrate
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, db, pool } from '../config/database.js';
import { logger } from '../config/logger.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Lokasi schema.sql. Saat `tsx src/db/migrate.ts` path relatif ke src/db. */
function resolveSchemaPath(): string {
  // Dipakai saat dijalankan dari source (tsx): src/db/schema.sql
  const devPath = join(here, 'schema.sql');
  return devPath;
}

/** Extension yang wajib ada sebelum tabel apa pun dibuat. */
const REQUIRED_EXTENSIONS = ['pgcrypto', 'citext'];

/** View turunan yang dipakai dashboard. */
const DERIVED_VIEWS = [
  {
    name: 'daily_order_sales',
    sql: `CREATE OR REPLACE VIEW daily_order_sales AS
SELECT branch_id,
       (placed_at AT TIME ZONE 'Asia/Jakarta')::date AS business_date,
       count(*) FILTER (WHERE order_status <> 'cancelled') AS order_count,
       coalesce(sum(total_idr) FILTER (WHERE payment_status = 'paid' AND order_status <> 'cancelled'), 0) AS paid_sales_idr
  FROM orders
 GROUP BY branch_id, (placed_at AT TIME ZONE 'Asia/Jakarta')::date`,
  },
];

async function ensureExtensions(): Promise<void> {
  for (const extension of REQUIRED_EXTENSIONS) {
    await db.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
    logger.info({ extension }, '[migrate] extension siap');
  }
}

/**
 * Eksekusi seluruh file schema.sql dalam satu transaksi.
 * Satu statement yang gagal membatalkan semuanya, jadi tidak ada schema
 * setengah jadi.
 */
async function applySchema(): Promise<void> {
  const schemaPath = resolveSchemaPath();
  const sql = await readFile(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    logger.info({ schemaPath }, '[migrate] schema diterapkan');
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: Error) => {
      logger.error({ err: rollbackError }, '[migrate] rollback gagal');
    });
    throw error;
  } finally {
    client.release();
  }
}

async function refreshDerivedViews(): Promise<void> {
  for (const view of DERIVED_VIEWS) {
    // CREATE OR REPLACE VIEW gagal kalau kolom view lama berubah tipe,
    // jadi drop dulu agar migrate tetap idempotent.
    await db.query(`DROP VIEW IF EXISTS ${view.name}`);
    await db.query(view.sql);
    logger.info({ view: view.name }, '[migrate] view diperbarui');
  }
}

/** Jumlah tabel di schema aplikasi, dipakai sebagai sanity check. */
async function countTables(): Promise<number> {
  const value = await db.queryScalar<number>(
    `SELECT count(*)::int
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'`,
  );
  return Number(value ?? 0);
}

async function main(): Promise<void> {
  logger.info('[migrate] mulai migrasi skema');

  await ensureExtensions();
  await applySchema();
  await refreshDerivedViews();

  const tables = await countTables();
  logger.info({ tables }, '[migrate] migrasi selesai');

  await closeDatabase();
}

// Jalankan sebagai entrypoint: bukan saat di-import.
main().catch(async (error: unknown) => {
  logger.error({ err: error }, '[migrate] migrasi gagal');
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
