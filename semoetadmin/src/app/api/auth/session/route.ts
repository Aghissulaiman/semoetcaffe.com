import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  fetchMe,
  refreshBackendShared,
  refreshCookieOptions,
  type TokenBundle,
} from "@/lib/server/session";

/**
 * GET /api/auth/session
 * Kembalikan user yang sedang login beserta role & permission-nya.
 * Otomatis memperbarui access token bila sudah kedaluwarsa.
 */
export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value ?? null;
  let accessToken = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  let refreshed: TokenBundle | null = null;

  const respond = (data: unknown, status = 200) => {
    const res = NextResponse.json(
      status === 200 ? { success: true, data } : data,
      { status },
    );
    if (refreshed) {
      res.cookies.set(ACCESS_COOKIE, refreshed.accessToken, accessCookieOptions(refreshed.expiresIn));
      if (refreshed.refreshToken) {
        res.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, refreshCookieOptions());
      }
    }
    return res;
  };

  try {
    if (!accessToken && refreshToken) {
      refreshed = await refreshBackendShared(refreshToken);
      accessToken = refreshed.accessToken;
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Belum masuk" } },
        { status: 401 },
      );
    }

    const me = await fetchMe(accessToken);
    return respond(me);
  } catch (err) {
    // Access token kedaluwarsa / invalid → coba refresh sekali lagi.
    let lastError: unknown = err;

    if (refreshToken) {
      try {
        refreshed = await refreshBackendShared(refreshToken);
        const me = await fetchMe(refreshed.accessToken);
        return respond(me);
      } catch (retryError) {
        lastError = retryError;
      }
    }

    // Error tanpa status = backend tidak bisa dihubungi (network error),
    // bukan sesi berakhir. Balas 503 agar klien tidak salah mengira logout.
    const status = (lastError as { status?: number } | null)?.status;
    if (typeof status !== "number") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: "Layanan backend tidak dapat dihubungi. Pastikan semoet_service sudah berjalan.",
          },
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sesi berakhir" } },
      { status: 401 },
    );
  }
}
