import { redirect } from "next/navigation";

/**
 * `/product` tanpa slug tidak punya produk untuk ditampilkan.
 * Arahkan ke daftar menu supaya pengguna tidak berhenti di halaman 404.
 */
export default function ProductIndexPage() {
  redirect("/menu");
}
