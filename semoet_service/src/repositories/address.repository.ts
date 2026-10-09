import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const ADDRESS_COLUMNS = `
  id, user_id, label, recipient_name, recipient_phone, address_line, address_detail,
  city, province, postal_code, latitude, longitude, delivery_instructions,
  is_default, created_at, updated_at
`;

export interface AddressRow {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  addressDetail: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listAddresses(
  userId: string,
  pagination: Paging,
  isDefault?: boolean,
  executor: Exec = db,
) {
  return many<AddressRow>(
    executor,
    `SELECT ${ADDRESS_COLUMNS}
       FROM user_addresses
      WHERE user_id = $1
        AND ($2::boolean IS NULL OR is_default = $2)
      ORDER BY is_default DESC, updated_at DESC
      ${paginationSql(pagination)}`,
    [userId, isDefault ?? null],
  );
}

export async function countAddresses(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM user_addresses WHERE user_id = $1`,
    [userId],
  );
  return Number(value ?? 0);
}

/** Ownership dicek langsung di query (user_id = $2) agar tidak bisa idor. */
export async function findAddress(addressId: string, userId: string, executor: Exec = db) {
  return one<AddressRow>(
    executor,
    `SELECT ${ADDRESS_COLUMNS} FROM user_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  );
}

export async function findAddressById(addressId: string, executor: Exec = db) {
  return one<AddressRow>(executor, `SELECT ${ADDRESS_COLUMNS} FROM user_addresses WHERE id = $1`, [
    addressId,
  ]);
}

export interface InsertAddressInput {
  userId: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  addressDetail?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryInstructions?: string | null;
  isDefault: boolean;
}

export async function insertAddress(input: InsertAddressInput, executor: Exec) {
  const row = await one<{ id: string }>(
    executor,
    `INSERT INTO user_addresses (
        user_id, label, recipient_name, recipient_phone, address_line, address_detail,
        city, province, postal_code, latitude, longitude, delivery_instructions, is_default
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      input.userId,
      input.label,
      input.recipientName,
      input.recipientPhone,
      input.addressLine,
      input.addressDetail ?? null,
      input.city,
      input.province ?? null,
      input.postalCode ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.deliveryInstructions ?? null,
      input.isDefault,
    ],
  );
  return row!;
}

export async function updateAddress(
  addressId: string,
  userId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  await executor.query(
    `UPDATE user_addresses SET ${assignments}, updated_at = now() WHERE id = $1 AND user_id = $2`,
    [addressId, userId, ...Object.values(data)],
  );
}

export async function deleteAddress(addressId: string, userId: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
    [addressId, userId],
  );
  return Boolean(row);
}

export async function countDefaultAddresses(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM user_addresses WHERE user_id = $1 AND is_default`,
    [userId],
  );
  return Number(value ?? 0);
}

/** Nonaktifkan default lama sebelum menandai alamat baru (partial unique index). */
export async function unsetDefaultAddresses(userId: string, executor: Exec) {
  await executor.query(`UPDATE user_addresses SET is_default = false WHERE user_id = $1 AND is_default`, [
    userId,
  ]);
}

export async function setDefaultAddress(addressId: string, userId: string, executor: Exec) {
  await executor.query(
    `UPDATE user_addresses SET is_default = (id = $2), updated_at = now() WHERE user_id = $1`,
    [userId, addressId],
  );
}