import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // URL gambar berasal dari backend/admin sehingga tidak bisa didaftarkan
      // di `next/image` remotePatterns. Elemen <img> dipakai dengan sengaja.
      "@next/next/no-img-element": "off",
      // Halaman ini SPA yang memuat data saat mount. Menyalakan flag loading
      // secara sinkron di effect adalah pola yang disengaja; aturan compiler
      // React terlalu ketat untuk pola fetch-on-mount seperti ini.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
