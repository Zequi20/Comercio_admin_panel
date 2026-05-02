import { NextResponse } from "next/server";

import { clearAuthCookies, getAuthCookieValues } from "@/app/lib/auth/session";
import { logoutFromAuthService } from "@/app/lib/services/auth-service";

export async function POST() {
  const { refreshToken } = await getAuthCookieValues();

  if (refreshToken) {
    try {
      await logoutFromAuthService(refreshToken);
    } catch {
      // El cierre local debe completarse aunque el refresh token ya no exista.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
