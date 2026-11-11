import "server-only";

import { NextResponse } from "next/server";

import { getCommerceRequestContextFromCookies } from "../auth/session";

/** Logistics is managed by administrators only (phase 1). */
export async function requireLogisticsAdmin(): Promise<
  { ok: true; accessToken: string } | { ok: false; response: NextResponse }
> {
  const context = await getCommerceRequestContextFromCookies();
  if (!context) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Tu sesión venció. Volvé a ingresar." }, { status: 401 }),
    };
  }
  if (!context.session.user.roles.includes("ADMIN")) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Solo un administrador puede gestionar la logística." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, accessToken: context.accessToken };
}

export const logisticsEnabledInPortal = () => process.env.NEXT_PUBLIC_LOGISTICS_ENABLED === "true";
