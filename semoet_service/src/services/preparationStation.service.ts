import { conflict, notFound } from "../errors/AppError.js";
import * as prepRepo from "../repositories/preparationStation.repository.js";
import { str, strOrNull, num, bool, iso } from "../utils/serialize.js";
import type { CreatePreparationStationInput, UpdatePreparationStationInput } from "../validators/preparationStation.validator.js";

function shape(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    sortOrder: num(row.sortOrder ?? row.sort_order),
    isActive: bool(row.isActive ?? row.is_active),
    createdAt: iso(row.createdAt ?? row.created_at),
    updatedAt: iso(row.updatedAt ?? row.updated_at),
  };
}

export async function listPreparationStations(activeOnly = false) {
  const rows = await prepRepo.listPreparationStations(activeOnly);
  return rows.map((r) => shape(r as Record<string, unknown>));
}

export async function createPreparationStation(input: CreatePreparationStationInput) {
  const code =
    input.code?.trim() ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  if (!code || code.length < 2) {
    throw conflict("Kode stasiun tidak valid. Isi manual jika perlu.");
  }
  const existing = await prepRepo.findPreparationStationByCode(code);
  if (existing) throw conflict("Kode stasiun sudah digunakan.");
  const created = await prepRepo.insertPreparationStation({
    code,
    name: input.name.trim(),
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  });
  const row = await prepRepo.findPreparationStationById(created!.id);
  if (!row) throw notFound("Stasiun");
  return shape(row as Record<string, unknown>);
}

export async function updatePreparationStation(id: string, input: UpdatePreparationStationInput) {
  const current = await prepRepo.findPreparationStationById(id);
  if (!current) throw notFound("Stasiun", id);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.code !== undefined) {
    const code = input.code.trim();
    if (code !== current.code) {
      const clash = await prepRepo.findPreparationStationByCode(code);
      if (clash && String(clash.id) !== id) throw conflict("Kode stasiun sudah digunakan.");
    }
    data.code = code;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  const updated = await prepRepo.updatePreparationStation(id, data);
  if (!updated) throw notFound("Stasiun", id);
  return shape(updated as Record<string, unknown>);
}

export async function deletePreparationStation(id: string) {
  const current = await prepRepo.findPreparationStationById(id);
  if (!current) throw notFound("Stasiun", id);
  // Optional: prevent delete if used by products (we'll check later)
  await prepRepo.deletePreparationStation(id);
  return { id, deleted: true };
}
