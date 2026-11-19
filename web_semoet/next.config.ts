import type { NextConfig } from "next";

/**
 * Backend `semoet_service` (Express) berjalan di port 4000.
 *
 * Semua panggilan API dari browser diarahkan ke `/api/v1/*` lalu di-proxy oleh
 * Next.js ke backend. Dengan begitu cookie refresh token tetap same-origin,
 * tidak ada masalah CORS, dan konfigurasi cukup satu tempat.
 *
 * Ubah target lewat `API_PROXY_TARGET` di `.env.local` bila backend ada di
 * mesin/port lain.
 */
const apiTarget = (process.env.API_PROXY_TARGET ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
