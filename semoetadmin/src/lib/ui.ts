/**
 * Kelas Tailwind bersama untuk kontrol formulir & tombol agar tampilan
 * konsisten di seluruh halaman (tema kopi, dukung dark mode).
 */

export const inputClass =
  "h-10 rounded-lg border border-coffee-linen bg-white px-3 text-theme-sm text-coffee-espresso outline-hidden transition focus:border-coffee-brown focus:ring-3 focus:ring-coffee-brown/15 dark:border-coffee-night-border dark:bg-coffee-night dark:text-coffee-cream";

export const textareaClass =
  "rounded-lg border border-coffee-linen bg-white px-3 py-2 text-theme-sm text-coffee-espresso outline-hidden transition focus:border-coffee-brown focus:ring-3 focus:ring-coffee-brown/15 dark:border-coffee-night-border dark:bg-coffee-night dark:text-coffee-cream";

export const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-coffee-brown px-4 text-theme-sm font-semibold text-coffee-milk transition-colors hover:bg-coffee-espresso disabled:cursor-not-allowed disabled:opacity-60 dark:bg-coffee-caramel dark:text-coffee-night dark:hover:bg-coffee-gold";

export const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-coffee-linen bg-white px-4 text-theme-sm font-medium text-coffee-dark transition-colors hover:bg-coffee-milk disabled:cursor-not-allowed disabled:opacity-60 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream/80 dark:hover:bg-white/5";

export const dangerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-coffee-danger/40 px-4 text-theme-sm font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:cursor-not-allowed disabled:opacity-60";

/** Label kecil di atas kontrol formulir. */
export const fieldLabelClass = "text-theme-xs font-medium text-coffee-muted";

/** Header kolom tabel. */
export const thClass =
  "pb-3 text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted";

/** Sel tabel standar. */
export const tdClass = "py-3 text-theme-sm text-coffee-dark dark:text-coffee-cream/80";

/** Baris tabel dengan garis pemisah. */
export const trClass =
  "border-b border-coffee-linen/70 last:border-0 dark:border-coffee-night-border/70";
