/**
 * Express application.
 *
 * Berkas ini hanya merakit middleware + router, tanpa logika bisnis.
 * Urutan registrasi di sini penting dan tidak boleh diacak:
 *
 *   1. trust proxy            -> IP asli di belakang reverse proxy / load balancer
 *   2. helmet, cors, ...      -> header keamanan + CORS
 *   3. requestContext/logRequest -> requestId & access log (harus paling awal)
 *   4. paymentWebhookRouter   -> WAJIB sebelum express.json() (butuh raw body)
 *   5. express.json/urlencoded-> body parsing untuk route lain
 *   6. globalLimiter          -> rate limit (webhook sengaja dikecualikan)
 *   7. router domain          -> /api/v1/*
 *   8. /health + /docs        -> di luar API_PREFIX supaya URL stabil
 *   9. notFoundHandler        -> 404 envelope
 *  10. errorHandler           -> error envelope (harus paling akhir)
 */

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';

import { env, getCorsOrigins } from './config/env.js';
import { db } from './config/database.js';
import { mountDocs } from './docs/swagger.js';
import { requestContext, logRequest } from './middlewares/requestContext.js';
import { globalLimiter } from './middlewares/rateLimit.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFound.js';
import { asyncHandler } from './middlewares/asyncHandler.js';

// Domain routers
import { adminRouter } from './routers/admin.routes.js';
import { addressRouter } from './routers/address.routes.js';
import { aiRouter } from './routers/ai.routes.js';
import { authRouter } from './routers/auth.routes.js';
import { branchRouter } from './routers/branch.routes.js';
import { catalogRouter } from './routers/catalog.routes.js';
import { chatRouter } from './routers/chat.routes.js';
import { deliveryRouter } from './routers/delivery.routes.js';
import { eventRouter } from './routers/event.routes.js';
import { familyRouter } from './routers/family.routes.js';
import { favoriteRouter } from './routers/favorite.routes.js';
import { gamificationRouter } from './routers/gamification.routes.js';
import { homeRouter } from './routers/home.routes.js';
import { inventoryRouter } from './routers/inventory.routes.js';
import { loyaltyRouter } from './routers/loyalty.routes.js';
import { momentRouter } from './routers/moment.routes.js';
import { notificationRouter } from './routers/notification.routes.js';
import { orderRouter } from './routers/order.routes.js';
import { paymentRouter, paymentWebhookRouter } from './routers/payment.routes.js';
import { profileRouter } from './routers/profile.routes.js';
import { promoRouter } from './routers/promo.routes.js';
import { reservationRouter } from './routers/reservation.routes.js';
import { reviewRouter } from './routers/review.routes.js';

const app = express();

// 1. Di belakang reverse proxy (nginx / Cloudflare / Traefik) agar
//    req.ip dan rate limiter melihat IP asli, bukan IP container.
app.set('trust proxy', env.TRUST_PROXY ? 1 : 0);

// 2. Security headers. CSP dimatikan karena Swagger UI memuat asset inline
//    (bundle JS/CSS + spec) — dengan CSP aktif halaman /docs jadi blank.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors({ origin: getCorsOrigins(), credentials: true }));
app.use(compression());
app.use(cookieParser());

// 3. Context + access log harus sebelum body parsing supaya request yang
//    gagal di body parser pun tetap punya requestId di log.
app.use(requestContext);
app.use(logRequest);

// 4. Webhook payment memakai express.raw() di dalam router-nya sendiri.
//    Router ini harus didaftarkan SEBELUM express.json() supaya stream
//    request masih utuh ketika express.raw() membacanya.
app.use(env.API_PREFIX, paymentWebhookRouter);

// 5. Body parsing untuk seluruh route lain.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. Rate limit global (auth limiter dipasang terpisah di auth.routes.ts).
app.use(globalLimiter);

const apiRouter = express.Router();

// --- Auth & identity -------------------------------------------------------
apiRouter.use('/auth', authRouter);

// --- Publik: katalog, cabang, beranda --------------------------------------
// `homeRouter` didahulukan karena `/categories/overview` harus menang atas
// `/categories/:slug` milik catalogRouter.
apiRouter.use(homeRouter);
apiRouter.use(catalogRouter);
apiRouter.use(branchRouter);

// --- Transaksi: order, payment, delivery -----------------------------------
apiRouter.use(orderRouter);
apiRouter.use(paymentRouter);
apiRouter.use(deliveryRouter);

// --- Interaksi di lokasi ----------------------------------------------------
apiRouter.use(reservationRouter);
apiRouter.use(eventRouter);

// --- Promo, loyalitas, ulasan ---------------------------------------------
apiRouter.use(promoRouter);
apiRouter.use(loyaltyRouter);
apiRouter.use(reviewRouter);

// --- Engagement & komunikasi ----------------------------------------------
apiRouter.use(momentRouter);
apiRouter.use(notificationRouter);
apiRouter.use(chatRouter);
apiRouter.use(gamificationRouter);
apiRouter.use(aiRouter);

// --- Admin -----------------------------------------------------------------
apiRouter.use(inventoryRouter);
apiRouter.use(adminRouter);

// ---|/me/ (profile pelanggan) ----------------------------------------------
// Router di sini memakai path relatif terhadap /me, misalnya /addresses
// dan /family. Didaftarkan terakhir supaya router root yang juga punya path
// /me/... (order, points, vouchers, reviews, ...) tidak tertimpa.
apiRouter.use('/me', addressRouter);
apiRouter.use('/me', familyRouter);
apiRouter.use('/me', favoriteRouter);
apiRouter.use('/me', profileRouter);

// 8. Health check. Dipasang dua kali: di root (dipakai Dockerfile
//    HEALTHCHECK dan load balancer) dan di bawah API_PREFIX supaya tombol
//    "Try it out" pada Swagger (server URL = /api/v1) ikut berfungsi.
const healthHandler: RequestHandler = asyncHandler(async (_req, res) => {
  try {
    await db.queryScalar('SELECT 1');
    res.status(200).json({
      status: 'ok',
      name: env.APP_NAME,
      env: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      database: 'up',
      timestamp: new Date().toISOString(),
    });
  } catch {
    // 503 supaya orchestrator (Docker/Kubernetes) knows instance belum siap.
    res.status(503).json({
      status: 'degraded',
      name: env.APP_NAME,
      env: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      database: 'down',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/health', healthHandler);
apiRouter.get('/health', healthHandler);

app.use(env.API_PREFIX, apiRouter);

// Swagger UI di /docs dan spec JSON di /openapi.json (di luar API_PREFIX).
mountDocs(app);

// 9 & 10. Error handling harus paling akhir.
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;