import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

export async function findGroupByOwner(ownerUserId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, owner_user_id, name, created_at FROM family_groups WHERE owner_user_id = $1`,
    [ownerUserId],
  );
}

export async function findGroupById(groupId: string, executor: Exec = db) {
  return one(executor, `SELECT id, owner_user_id, name, created_at FROM family_groups WHERE id = $1`, [
    groupId,
  ]);
}

export async function insertGroup(ownerUserId: string, name: string, executor: Exec = db) {
  return one<{ id: string; name: string }>(
    executor,
    `INSERT INTO family_groups (owner_user_id, name) VALUES ($1, $2) RETURNING id, owner_user_id, name, created_at`,
    [ownerUserId, name],
  );
}

export async function updateGroupName(groupId: string, ownerUserId: string, name: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE family_groups SET name = $3 WHERE id = $1 AND owner_user_id = $2 RETURNING id, name`,
    [groupId, ownerUserId, name],
  );
}

export async function deleteGroup(groupId: string, ownerUserId: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM family_groups WHERE id = $1 AND owner_user_id = $2 RETURNING id`,
    [groupId, ownerUserId],
  );
  return Boolean(row);
}

const MEMBER_SELECT = `
  fm.id, fm.family_group_id, fm.linked_user_id, fm.display_name, fm.relationship,
  fm.birth_date, fm.created_at,
  u.email AS linked_user_email, u.phone_e164 AS linked_user_phone,
  u.display_name AS linked_user_display_name
`;

export async function listMembers(groupId: string, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${MEMBER_SELECT}
       FROM family_members fm
       LEFT JOIN users u ON u.id = fm.linked_user_id AND u.deleted_at IS NULL
      WHERE fm.family_group_id = $1
      ORDER BY fm.created_at ASC
      ${paginationSql(pagination)}`,
    [groupId],
  );
}

export async function countMembers(groupId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM family_members WHERE family_group_id = $1`,
    [groupId],
  );
  return Number(value ?? 0);
}

export async function findMember(memberId: string, groupId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${MEMBER_SELECT} FROM family_members fm
       LEFT JOIN users u ON u.id = fm.linked_user_id AND u.deleted_at IS NULL
      WHERE fm.id = $1 AND fm.family_group_id = $2`,
    [memberId, groupId],
  );
}

export async function findMemberByLinkedUser(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT fm.id, fm.family_group_id
       FROM family_members fm
      WHERE fm.linked_user_id = $1
      LIMIT 1`,
    [userId],
  );
}

export async function insertMember(
  input: {
    groupId: string;
    linkedUserId?: string | null;
    displayName: string;
    relationship?: string | null;
    birthDate?: string | null;
  },
  executor: Exec = db,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO family_members (family_group_id, linked_user_id, display_name, relationship, birth_date)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, family_group_id, linked_user_id, display_name, relationship, birth_date, created_at`,
    [input.groupId, input.linkedUserId ?? null, input.displayName, input.relationship ?? null, input.birthDate ?? null],
  );
}

export async function updateMember(
  memberId: string,
  groupId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  await executor.query(
    `UPDATE family_members SET ${assignments} WHERE id = $1 AND family_group_id = $2`,
    [memberId, groupId, ...Object.values(data)],
  );
}

export async function deleteMember(memberId: string, groupId: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM family_members WHERE id = $1 AND family_group_id = $2 RETURNING id`,
    [memberId, groupId],
  );
  return Boolean(row);
}