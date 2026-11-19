import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, logoutBackend } from "@/lib/server/session";

/**
 * POST /api/auth/logout
 * Cabut sesi di backend (bila token ada), lalu hapus cookie lokal.
 */
export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value ?? null;

  let allDevices = false;
  try {
    const body = (await req.json()) as { allDevices?: boolean };
    allDevices = Boolean(body?.allDevices);
  } catch {
    // Body opsional.
  }

  if (accessToken) {
    await logoutBackend(accessToken, allDevices);
  }

  const res = NextResponse.json({ success: true, data: { loggedOut: true } });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
