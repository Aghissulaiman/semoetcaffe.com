import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "semoet_at";
const REFRESH_COOKIE = "semoet_rt";

/**
 * Proxy (pengganti middleware di Next.js 16).
 *
 * Tugas utama: jaga halaman dashboard agar hanya bisa diakses saat sudah login.
 * - Belum login → arahkan ke /signin (sambil menyimpan tujuan awal).
 * - Sudah login tapi membuka /signin → arahkan ke dashboard.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);
  const isAuthPage = pathname === "/signin";

  if (!hasSession && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|images|.*\\..*).*)"],
};
