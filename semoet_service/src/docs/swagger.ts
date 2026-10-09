/**
 * Mount Swagger UI + endpoint JSON spec.
 *
 * Swagger UI sengaja dipasang di luar `API_PREFIX` supaya URL-nya stabil
 * (`/docs`) tidak ikut berubah kalau versi API dinaikkan.
 */

import type { Express, RequestHandler } from 'express';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import { API_VERSION, countOperations, openApiDocument } from './openapi.js';
import type { OpenApiDocument } from './types.js';

/** Path dokumen JSON. Di luar API_PREFIX supaya tidak ikut naik versi. */
export const OPENAPI_JSON_PATH = '/openapi.json';

/** Path Swagger UI. */
export const SWAGGER_UI_PATH = '/docs';

/**
 * Router dokumentasi. Caller responsible mount ke app dengan prefix sendiri
 * (lihat `mountDocs`).
 */
export function docsRouter(): RequestHandler {
  const router = express.Router();

  // JSON spec apa adanya supaya bisa dipakai Postman / codegen / client generator.
  router.get(OPENAPI_JSON_PATH, (_req, res) => {
    res.type('application/json').send(JSON.stringify(openApiDocument, null, 2));
  });

  router.use(
    SWAGGER_UI_PATH,
    // Argumen pertama serveFiles adalah dokumen spec yang dibungkus ke file
    // swagger-ui-init.js. Kalau undefined, UI tidak punya spec lalu fetch
    // URL lain (root server) yang isinya bukan OpenAPI -> parser error.
    swaggerUi.serveFiles(openApiDocument as never, {
      swaggerOptions: swaggerUiOptions(),
    }),
    swaggerUi.setup(openApiDocument as never, {
      customSiteTitle: `Semoet Cafe API v${API_VERSION}`,
      swaggerOptions: swaggerUiOptions(),
    }),
  );

  return router;
}

function swaggerUiOptions(): Record<string, unknown> {
  return {
    // Endpoint webhook payment tidak bisa dicoba dari browser, tapi tetap
    // ditampilkan agar payload-nya terdokumentasi.
    tryItOutEnabled: !isProduction,
    docExpansion: 'none',
    defaultModelsExpandDepth: 1,
    displayRequestDuration: true,
    filter: true,
    persistAuthorization: true,
    syntaxHighlight: { activate: true, theme: 'nord' },
  };
}

/**
 * Pasang dokumentasi ke aplikasi.
 *
 * `logger.info` di sini documenting bahwa spec sudah aktif supaya mudah
 * dicek saat start server lokal.
 */
export function mountDocs(app: Express): void {
  app.use(docsRouter());
  logger.info(
    {
      swaggerUi: `${SWAGGER_UI_PATH}`,
      openapiJson: OPENAPI_JSON_PATH,
      operations: countOperations(),
    },
    '[docs] OpenAPI spec aktif',
  );
}

export { openApiDocument };
export type { OpenApiDocument };
