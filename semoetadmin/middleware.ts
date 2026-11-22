import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "semoet_at";
const REFRESH_COOKIE = "semoet_rt";

// Public paths that don't require auth
const PUBLIC_PATHS = [
  "/signin",
  "/akses-ditolak", // allow showing access denied page
];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/auth")) return true; // auth API routes
  if (pathname.startsWith("/favicon") || pathname.startsWith("/images") || pathname.startsWith("/icons")) return true;
  if (pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$/)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasAccess = request.cookies.has(ACCESS_COOKIE);
  const hasRefresh = request.cookies.has(REFRESH_COOKIE);

  if (!hasAccess && !hasRefresh) {
    const signinUrl = new URL("/signin", request.url);
    signinUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
