# syntax=docker/dockerfile:1
# =============================================================================
# Semoet Cafe backend service
#
# Multi-stage build:
#   deps  -> install dependency production
#   build -> compile TypeScript ke dist/
#   prod  -> image akhir, non-root, hanya file yang diperlukan saat runtime
#
# Build:  docker build -t semoet-service:latest .
# Run:    docker run --rm -p 4000:4000 --env-file .env semoet-service:latest
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: install seluruh dependency (dev + prod) untuk proses compile.
# Cache keyed oleh lockfile supaya install di-cache saat source berubah.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# `npm ci` menghormati package-lock.json dan gagal bila lockfile tidak sinkron.
# libc6-compat dibutuhkan oleh modul native (bcryptjs fallback), alpine-safe.
RUN apk add --no-cache libc6-compat \
    && npm ci --no-audit --no-fund

# -----------------------------------------------------------------------------
# Stage 2: compile TypeScript.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

# tsc.project tidak butuh devDependency lain di luar node_modules.
RUN npm run build

# Prune dependency dev supaya tidak ikut terbawa ke image runtime.
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 3: image runtime.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# dumb-init memberi PID 1 yang benar sehingga SIGTERM diteruskan ke node
# dan graceful shutdown di src/server.ts sempat berjalan.
RUN apk add --no-cache dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S nodejs -G nodejs

COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

EXPOSE 4000

# Healthcheck memakai endpoint /health (di luar /api/v1) yang memeriksa
# konektivitas database. Interval 30s, start period 15s untuk memberi waktu
# koneksi pool terbentuk setelah container start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/server.js"]
