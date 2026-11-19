import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  apiV1,
  refreshBackendShared,
  refreshCookieOptions,
  type TokenBundle,
} from "@/lib/server/session";

/**
 * Proxy BFF: /api/proxy/<path>  ->  <SEMOET_API_URL>/api/v1/<path>
 *
 * Tujuan:
 * - Menyembunyikan URL backend & menyelesaikan masalah CORS/cookie lintas port.
 * - Menyisipkan Authorization dari cookie httpOnly.
 * - Memperbarui access token secara transparan bila sudah kedaluwarsa.
 */
type RouteContext = { params: Promise<{ path: string[] }> };

async function tryRefresh(token: string): Promise<TokenBundle | null> {
  try {
    return await refreshBackendShared(token);
  } catch {
    return null;
  }
}

async function handle(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = apiV1(`/${path.join("/")}${req.nextUrl.search}`);

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value ?? null;
  let accessToken = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  let refreshed: TokenBundle | null = null;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sesi tidak ditemukan" } },
      { status: 401 },
    );
  }

  if (!accessToken && refreshToken) {
    refreshed = await tryRefresh(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  const bodyText = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const forward = () =>
    fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("content-type") ?? "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: bodyText,
      cache: "no-store",
    });

  let backendRes: Response;

  try {
    backendRes = await forward();

    if (backendRes.status === 401 && refreshToken && !refreshed) {
      refreshed = await tryRefresh(refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        backendRes = await forward();
      }
    }
  } catch {
    // Backend mati / tidak bisa dijangkau. Jangan biarkan route handler
    // melempar error mentah (Next akan membalas 500 tanpa envelope JSON).
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "Layanan backend tidak dapat dihubungi. Pastikan semoet_service sudah berjalan.",
        },
      },
      { status: 502 },
    );
  }

  const text = await backendRes.text();
  const res = new NextResponse(text || null, {
    status: backendRes.status,
    headers: {
      "Content-Type": backendRes.headers.get("content-type") ?? "application/json",
    },
  });

  if (refreshed) {
    res.cookies.set(ACCESS_COOKIE, refreshed.accessToken, accessCookieOptions(refreshed.expiresIn));
    if (refreshed.refreshToken) {
      res.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, refreshCookieOptions());
    }
  }

  // Sesi tidak bisa diselamatkan -> bersihkan cookie agar user diarahkan ke login.
  if (backendRes.status === 401 && !refreshed) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  }

  return res;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
