import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Pengeluaran operasional
// --------------------------------------------------------------------------

/** Kolom khusus: tanggal disimpan sebagai `date`, dibaca via teks supaya aman. */
const EXPENSE_COLUMNS = `id, category, name, amount_idr, note,\n       to_char(expense_date, 'YYYY-MM-DD') AS expense_date, created_by, created_at, updated_at`;

export interface ListExpenseFilters {
  category?: string;
  from?: string;
  to?: string;
  q?: string;
}

export async function listExpenses(
  filters: ListExpenseFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${EXPENSE_COLUMNS}
       FROM expenses
      WHERE ($1::text IS NULL OR category = $1)
        AND ($2::date IS NULL OR expense_date >= $2::date)
        AND ($3::date IS NULL OR expense_date <= $3::date)
        AND ($4::text IS NULL OR note ILIKE '%' || $4 || '%' OR name ILIKE '%' || $4 || '%')
      ORDER BY expense_date DESC, amount_idr DESC
      ${paginationSql(pagination)}`,
    [filters.category ?? null, filters.from ?? null, filters.to ?? null, filters.q ?? null],
  );
}

export async function countExpenses(filters: ListExpenseFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM expenses
      WHERE ($1::text IS NULL OR category = $1)
        AND ($2::date IS NULL OR expense_date >= $2::date)
        AND ($3::date IS NULL OR expense_date <= $3::date)
        AND ($4::text IS NULL OR note ILIKE '%' || $4 || '%' OR name ILIKE '%' || $4 || '%')`,
    [filters.category ?? null, filters.from ?? null, filters.to ?? null, filters.q ?? null],
  );
  return Number(value ?? 0);
}

export async function findExpenseById(expenseId: string, executor: Exec = db) {
  return one(executor, `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1`, [expenseId]);
}

export interface InsertExpenseInput {
  category: string;
  name: string;
  amountIdr: number;
  note: string | null;
  expenseDate: string;
  createdBy: string | null;
}

export async function insertExpense(input: InsertExpenseInput, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO expenses (category, name, amount_idr, note, expense_date, created_by)
     VALUES ($1, $2, $3, $4, $5::date, $6)
     RETURNING ${EXPENSE_COLUMNS}`,
    [input.category, input.name, input.amountIdr, input.note, input.expenseDate, input.createdBy],
  );
}

export interface UpdateExpenseInput {
  category?: string;
  name?: string;
  amountIdr?: number;
  note?: string | null;
  expenseDate?: string;
}

/** Update parsial; hanya kolom yang dikirim yang ditulis. */
export async function updateExpense(
  expenseId: string,
  input: UpdateExpenseInput,
  executor: Exec = db,
) {
  const assignments: string[] = [];
  const params: unknown[] = [expenseId];

  const push = (column: string, value: unknown, cast = '') => {
    params.push(value);
    assignments.push(`${column} = $${params.length}${cast}`);
  };

  if (input.category !== undefined) push('category', input.category);
  if (input.name !== undefined) push('name', input.name);
  if (input.amountIdr !== undefined) push('amount_idr', input.amountIdr);
  if (input.note !== undefined) push('note', input.note);
  if (input.expenseDate !== undefined) push('expense_date', input.expenseDate, '::date');

  if (assignments.length === 0) {
    return findExpenseById(expenseId, executor);
  }

  return one(
    executor,
    `UPDATE expenses
        SET ${assignments.join(', ')}, updated_at = now()
      WHERE id = $1
      RETURNING ${EXPENSE_COLUMNS}`,
    params,
  );
}

export async function deleteExpense(expenseId: string, executor: Exec = db) {
  const deleted = await scalar<string>(
    executor,
    `DELETE FROM expenses WHERE id = $1 RETURNING id`,
    [expenseId],
  );
  return Boolean(deleted);
}
