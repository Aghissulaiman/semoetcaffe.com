# Konversi wajib di src/controllers, src/routers, src/app.ts

Import HARUS pakai ekstensi `.js` (ESM / NodeNext).

## 1. File name & folder

- Service  : `src/services/<domain>.service.ts`
- Controller: `src/controllers/<domain>.controller.ts`
- Router  : `src/routers/<domain>.routes.ts`
- Domain   : lowercase, tanpa sufiks angka. Contoh: `order`, `loyalty`, `gamification`.

## 2. Router

```ts
import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { writeLimiter } from '../middlewares/rateLimit.js';
import { orderIdParamSchema, listMyOrderQuerySchema } from '../validators/order.validator.js';

export const orderRouter = Router();

orderRouter.post(
  '/orders',
  authenticate,
  writeLimiter,
  validate({ body: createOrderSchema }),
  asyncHandler(orderController.create),
);
```

Aturan:
- Semua handler wajib dibungkus `asyncHandler(...)`. Tidak ada try/catch manual.
- `authenticate` (wajib login) / `optionalAuthenticate` (publik tapi beda respons) dipakai SEBELUM `validate`.
- Rate limiter: `writeLimiter` untuk POST/PATCH/DELETE yang menulis, `readLimiter` untuk list berat, `aiLimiter` untuk AI, `authLimiter`/`otpLimiter` untuk auth/OTP. `globalLimiter` sudah dipasang di app.ts — jangan pasang ulang.
- Route yang butuh parameter named (mis. `/orders/:orderId/items/:itemId`) harus didaftarkan SEBELUM route `/orders/:orderId` agar tidak tertangkap.
- Export router sebagai named export `<domain>Router`.

## 3. Controller

```ts
import type { Request, Response } from 'express';
import * as orderService from '../services/order.service.js';
import { sendCreated, sendPaginated, sendSuccess, sendNoContent } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId, getIdempotencyKey, getIp, getUserAgent } from '../utils/request.js';

export async function list(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListMyOrderQuery>(req);
  const userId = getUserId(req);
  const result = await orderService.listOrders(userId, query);
  return sendPaginated(res, result.items, {
    page: result.meta.page, limit: result.meta.limit, total: result.meta.total,
  });
}

export async function create(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateOrderInput>(req);
  const data = await orderService.createOrder(userId, body, {
    idempotencyKey: getIdempotencyKey(req),
    ipAddress: getIp(req),
  });
  return sendCreated(res, data);
}
```

Aturan:
- Ambil input HANYA lewat `getQuery` / `getBody` / `getParams` (sudah divalidasi Zod oleh middleware).
- User id lewat `getUserId(req)` (throw bila `authenticate` lupa dipasang).
- Bentuk respons: `sendSuccess` (200), `sendCreated` (201), `sendAccepted` (202), `sendNoContent` (204), `sendPaginated` (list).
- List endpoint WAJIB `sendPaginated` dengan `{ page, limit, total }`.
- Controller TIDAK melempar error domain / tidak menulis SQL / tidak memanggil repo langsung.
- Nama fungsi controller = verb HTTP (`list`, `detail`, `create`, `update`, `remove`, `cancel`, `verify`, ...). Kalau nama domain lebih jelas, boleh (`listForUser`, `scanTableQr`).
- Semua handler bertipe `Promise<Response>` kecuali `sendNoContent` (tetap `Promise<Response>`).

## 4. Service

```ts
export async function listOrders(userId: string, query: ListMyOrderQuery): Promise<Paginated<OrderDto>> {
  const paging = parsePagination(query);
  const filters = { status: query.status, from: query.from, to: query.to };
  const rows = await orderRepo.listOrdersForUser(userId, filters, paging);
  const total = await orderRepo.countOrdersForUser(userId, filters);
  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeOrderSummary), meta: buildPaginationMeta(pagination) };
}
```

Aturan:
- `parsePagination(query)` -> `{ page, limit, offset }` untuk query list; `Pagination` butuh `total` juga (setelah count).
- Import repo dengan namespace: `import * as orderRepo from '../repositories/order.repository.js';`
- Semua operasi tulis yang butuh atomisitas: `withTransaction(async (tx) => { ... })` dan teruskan `tx` sebagai argumen `executor` terakhir ke repo.
- Row dari repo sudah camelCase (lihat `camelizeRow`), jadi(shape DTO) boleh langsung baca `row.orderNumber`, bukan `row.order_number`.
- Monetary WAJIB integer IDR; pakai `src/utils/money.ts` (`calculateOrderTotals`, `calculateLineTotal`, `calculateDiscountAmount`, `pointsEarnedFromAmount`) supaya konsisten dengan CHECK constraint.
- Validasi sebelum tulis: ownership (`findOrderForUser`), status transition (`ORDER_STATUS_FLOW`), dan aturan DB lain. Throw dari `src/errors/AppError.ts`.
- Lock baris pakai fungsi repo ber`FOR UPDATE` (`lockOrderForUser`, `lockUserForPoints`, `lockPromoByCode`, ...). Jangan tulis `FOR UPDATE` di service.
- Idempotensi: kalau tabel punya `idempotency_key`, cek dulu lewat repo (`findPaymentByIdempotencyKey`, `findPlayByIdempotencyKey`, `findPointEntryByIdempotencyKey`) dan kembalikan hasil lama kalau ada.
- Generate nomor dokumen (`generateOrderNumber`, `generateReservationNumber`, `generateEventBookingNumber`) lalu cek bentrok (`orderNumberExists`) dalam retry loop di dalam transaksi.
- Kirim notifikasi lewat `src/utils/notifier.ts` (`sendSms`, `sendEmail`, `sendPush`) setelah transaksi COMMIT, jangan di dalam transaksi.
- Return DTO/domain object, bukan raw row, kalau ada reshaping berarti.

## 5. app.ts

Semua router di-mount satu kali di `src/app.ts` di bawah `API_PREFIX`:

```ts
apiRouter.use(orderRouter);
```

Kalau menambah router baru, tambahkan juga import + `apiRouter.use(...)` di `src/app.ts`.

## 6. Gaya bahasa

- Komentar, pesan error, dan string ke user dalam bahasa Indonesia yang natural.
- Tidak ada emoji di kode. Tidak ada karakter non-Latin/asing yang nyelip (fix contoh: `先用` -> pakai).
- Format: 2 spasi indent, single quote, trailing comma multiline, `;` di akhir statement.