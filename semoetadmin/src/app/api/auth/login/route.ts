import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  loginBackend,
  refreshCookieOptions,
} from "@/lib/server/session";

/**
 * POST /api/auth/login
 * Login ke backend Semoet, lalu simpan access + refresh token sebagai cookie httpOnly.
 */
export async function POST(req: NextRequest) {
  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Body tidak valid" } },
      { status: 400 },
    );
  }

  const identifier = (body.identifier ?? "").trim();
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email/telepon dan kata sandi wajib diisi",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await loginBackend(identifier, password);

    const res = NextResponse.json({
      success: true,
      data: { user: result.user },
    });
    res.cookies.set(ACCESS_COOKIE, result.accessToken, accessCookieOptions(result.expiresIn));
    if (result.refreshToken) {
      res.cookies.set(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
    }
    return res;
  } catch (err) {
    const error = err as { status?: number; message?: string; code?: string };
    const status = error.status && error.status >= 400 ? error.status : 401;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code ?? "UNAUTHORIZED",
          message: error.message ?? "Email/telepon atau kata sandi salah",
        },
      },
      { status },
    );
  }
}
