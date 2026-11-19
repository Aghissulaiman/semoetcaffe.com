import { db, withTransaction } from '../config/database.js';
import { BadRequestError, notFound } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as expenseRepo from '../repositories/expense.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, str, strOrNull } from '../utils/serialize.js';
import {
  createExpenseSchema,
  listExpenseQuerySchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type ListExpenseQuery,
  type UpdateExpenseInput,
} from '../validators/expense.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Shape response pengeluaran: nominal selalu integer IDR. */
function shapeExpense(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    category: str(row.category),
    name: str(row.name),
    amountIdr: Number(row.amountIdr ?? 0),
    note: strOrNull(row.note),
    expenseDate: str(row.expenseDate),
    createdBy: strOrNull(row.createdBy),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Daftar pengeluaran operasional (kategori, rentang tanggal, pencarian). */
export async function listExpenses(query: ListExpenseQuery): Promise<Paginated<ReturnType<typeof shapeExpense>>> {
  const parsed = listExpenseQuerySchema.safeParse(query ?? {});
  const paging = parsePagination(parsed.success ? parsed.data : {});
  const filters = {
    category: parsed.success ? parsed.data.category ?? undefined : undefined,
    from: parsed.success ? parsed.data.from ?? undefined : undefined,
    to: parsed.success ? parsed.data.to ?? undefined : undefined,
    q: parsed.success ? parsed.data.q ?? undefined : undefined,
  };

  const rows = await expenseRepo.listExpenses(filters, paging);
  const total = await expenseRepo.countExpenses(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return { items: rows.map(shapeExpense), meta: buildPaginationMeta(pagination) };
}

export async function getExpense(expenseId: string) {
  const row = await expenseRepo.findExpenseById(expenseId);
  if (!row) throw notFound('Pengeluaran', expenseId);
  return shapeExpense(row);
}

export async function createExpense(
  input: CreateExpenseInput,
  actorUserId: string | null,
  audit: { requestId?: string | null; ipAddress?: string | null } = {},
) {
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Data pengeluaran tidak valid');
  }

  const values = parsed.data;
  const expenseDate = values.expenseDate ?? new Date().toISOString().slice(0, 10);

  const created = await withTransaction(async (tx) => {
    const inserted = await expenseRepo.insertExpense(
      {
        category: values.category,
        name: values.name,
        amountIdr: values.amountIdr,
        note: values.note ?? null,
        expenseDate,
        createdBy: actorUserId,
      },
      tx,
    );
    if (!inserted) throw new Error('Gagal menyimpan pengeluaran, silakan coba lagi');
    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.expense.create',
        entityType: 'expense',
        entityId: String(inserted.id),
        oldData: null,
        newData: {
          category: values.category,
          name: values.name,
          amountIdr: values.amountIdr,
          note: values.note ?? null,
          expenseDate,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return inserted;
  });

  return shapeExpense(created);
}

export async function updateExpense(
  expenseId: string,
  input: UpdateExpenseInput,
  actorUserId: string | null,
  audit: { requestId?: string | null; ipAddress?: string | null } = {},
) {
  const parsed = updateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Data pengeluaran tidak valid');
  }

  return withTransaction(async (tx) => {
    const existing = await expenseRepo.findExpenseById(expenseId, tx);
    if (!existing) throw notFound('Pengeluaran', expenseId);

    const values = parsed.data;
    const updated = await expenseRepo.updateExpense(
      expenseId,
      {
        category: values.category,
        name: values.name,
        amountIdr: values.amountIdr,
        note: values.note,
        expenseDate: values.expenseDate,
      },
      tx,
    );
    if (!updated) throw notFound('Pengeluaran', expenseId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.expense.update',
        entityType: 'expense',
        entityId: expenseId,
        oldData: shapeExpense(existing),
        newData: shapeExpense(updated),
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeExpense(updated);
  });
}

export async function deleteExpense(
  expenseId: string,
  actorUserId: string | null,
  audit: { requestId?: string | null; ipAddress?: string | null } = {},
) {
  return withTransaction(async (tx) => {
    const existing = await expenseRepo.findExpenseById(expenseId, tx);
    if (!existing) throw notFound('Pengeluaran', expenseId);

    await expenseRepo.deleteExpense(expenseId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.expense.delete',
        entityType: 'expense',
        entityId: expenseId,
        oldData: shapeExpense(existing),
        newData: null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: expenseId, deleted: true };
  });
}
