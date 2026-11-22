import { db, many, one, type Exec } from "./base.js";

export async function listPreparationStations(activeOnly = false, executor: Exec = db) {
  if (activeOnly) {
    return many(
      executor,
      `SELECT id, code, name, sort_order, is_active, created_at, updated_at
         FROM preparation_stations
        WHERE is_active = true
        ORDER BY sort_order ASC, name ASC`,
    );
  }
  return many(
    executor,
    `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM preparation_stations
      ORDER BY sort_order ASC, name ASC`,
  );
}

export async function findPreparationStationById(id: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM preparation_stations
      WHERE id = $1`,
    [id],
  );
}

export async function findPreparationStationByCode(code: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM preparation_stations
      WHERE code = $1`,
    [code],
  );
}

export async function insertPreparationStation(
  input: { code: string; name: string; sortOrder: number; isActive: boolean },
  executor: Exec = db,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO preparation_stations (code, name, sort_order, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.code, input.name, input.sortOrder, input.isActive],
  );
}

export async function updatePreparationStation(
  id: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return findPreparationStationById(id, executor);
  const sets: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;
  for (const [k, v] of entries) {
    // map camelCase keys to snake_case
    const col =
      k === "sortOrder" ? "sort_order" : k === "isActive" ? "is_active" : k;
    sets.push(`${col} = $${idx}`);
    values.push(v);
    idx++;
  }
  sets.push("updated_at = now()");
  return one(
    executor,
    `UPDATE preparation_stations SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
    values,
  );
}

export async function deletePreparationStation(id: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM preparation_stations WHERE id = $1 RETURNING id`,
    [id],
  );
  return row;
}
