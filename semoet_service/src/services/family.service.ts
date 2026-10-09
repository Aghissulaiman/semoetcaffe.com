import { withTransaction } from '../config/database.js';
import { conflict, notFound } from '../errors/AppError.js';
import * as familyRepo from '../repositories/family.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import type {
  CreateFamilyMemberInput,
  ListFavoriteQuery,
  UpdateFamilyMemberInput,
  UpdateFamilyInput,
} from '../validators/user.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

function shapeMember(row: Record<string, unknown>) {
  return {
    id: row.id,
    familyGroupId: row.familyGroupId ?? row.family_group_id,
    linkedUserId: row.linkedUserId ?? row.linked_user_id,
    displayName: row.displayName ?? row.display_name,
    relationship: row.relationship,
    birthDate: row.birthDate ?? row.birth_date,
    createdAt: row.createdAt ?? row.created_at,
    linkedUserEmail: row.linkedUserEmail ?? row.linked_user_email,
    linkedUserPhone: row.linkedUserPhone ?? row.linked_user_phone,
    linkedUserDisplayName: row.linkedUserDisplayName ?? row.linked_user_display_name,
    isPrimary: Boolean(row.isPrimary ?? row.is_primary ?? false),
  };
}

function shapeGroup(row: Record<string, unknown>) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId ?? row.owner_user_id,
    name: row.name,
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function ensureGroup(userId: string, name?: string) {
  const existing = await familyRepo.findGroupByOwner(userId);
  if (existing) return existing;
  const groupName = (name ?? '').trim() || 'Keluarga Saya';
  return (await familyRepo.insertGroup(userId, groupName)) as any;
}

export async function getFamily(userId: string) {
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) {
    return { group: null, members: [], memberCount: 0 };
  }
  const members = await familyRepo.listMembers((group as any).id, { limit: 100, offset: 0 });
  return {
    group: shapeGroup(group),
    members: members.map(shapeMember),
    memberCount: members.length,
  };
}

export async function updateFamily(userId: string, input: UpdateFamilyInput) {
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) {
    const created = await (familyRepo.insertGroup(userId, input.name.trim()) as any);
    return { group: shapeGroup(created), created: true };
  }
  await familyRepo.updateGroupName((group as any).id, userId, input.name.trim());
  const updated = await familyRepo.findGroupByOwner(userId);
  return { group: updated ? shapeGroup(updated as any) : shapeGroup(group as any), created: false };
}

export async function listMembers(userId: string, query: ListFavoriteQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) {
    const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total: 0 };
    return { items: [], meta: buildPaginationMeta(pagination) };
  }
  const rows = await familyRepo.listMembers((group as any).id, paging) as any[];
  const total = await familyRepo.countMembers((group as any).id);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: (rows as any[]).map(shapeMember),
    meta: buildPaginationMeta(pagination),
  };
}

export async function createMember(userId: string, input: CreateFamilyMemberInput) {
  const group = await ensureGroup(userId);

  if (input.linkedUserId) {
    if (input.linkedUserId === userId) {
      throw conflict('Tidak dapat menautkan diri sendiri sebagai anggota keluarga');
    }
    const existingMember = await familyRepo.findMemberByLinkedUser(input.linkedUserId);
    if (existingMember) {
      throw conflict('User tersebut sudah terdaftar di grup keluarga lain');
    }
    const linkedUser = await userRepo.findProfile(input.linkedUserId) as any;
    if (!linkedUser) {
      throw notFound('User', input.linkedUserId);
    }
  }

  const member = await familyRepo.insertMember({
    groupId: (group as any).id,
    linkedUserId: input.linkedUserId ?? null,
    displayName: input.displayName.trim(),
    relationship: input.relationship ?? null,
    birthDate: input.birthDate ?? null,
  });

  const full = await familyRepo.findMember((member as any).id, (group as any).id);
  return full ? shapeMember(full as any) : { id: (member as any).id };
}

export async function updateMember(userId: string, memberId: string, input: UpdateFamilyMemberInput) {
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) throw notFound('Anggota keluarga');

  const existing = await familyRepo.findMember(memberId, (group as any).id);
  if (!existing) throw notFound('Anggota keluarga');

  const updates: Record<string, unknown> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName.trim();
  if (input.relationship !== undefined) updates.relationship = input.relationship;
  if (input.birthDate !== undefined) updates.birth_date = input.birthDate;

  if (Object.keys(updates).length > 0) {
    await familyRepo.updateMember(memberId, (group as any).id, updates);
  }

  const full = await familyRepo.findMember(memberId, (group as any).id);
  return full ? shapeMember(full as any) : shapeMember(existing as any);
}

export async function deleteMember(userId: string, memberId: string) {
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) throw notFound('Anggota keluarga');

  const existing = await familyRepo.findMember(memberId, (group as any).id);
  if (!existing) throw notFound('Anggota keluarga');

  await familyRepo.deleteMember(memberId, (group as any).id);
  return { deleted: true };
}

export async function setPrimaryMember(userId: string, memberId: string) {
  const group = await familyRepo.findGroupByOwner(userId);
  if (!group) throw notFound('Anggota keluarga');

  const existing = await familyRepo.findMember(memberId, (group as any).id);
  if (!existing) throw notFound('Anggota keluarga');

  return shapeMember(existing as any);
}