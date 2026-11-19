import type { NextConfig } from "next";

const backendUrl = (
  process.env.SEMOET_API_URL?.trim() || "http://localhost:4000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Proxy same-origin agar cookie refresh token (httpOnly) tetap terkirim ke
  // backend saat development. Di produksi bisa dioverride lewat SEMOET_API_URL
  // atau NEXT_PUBLIC_API_URL.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
