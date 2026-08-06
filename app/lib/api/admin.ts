import "server-only";

import { NextResponse } from "next/server";

import { getCommerceRequestContextFromCookies } from "../auth/session";

export async function getAdminApiContext() {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "La sesión no es válida o expiró." },
        { status: 401 }
      ),
    };
  }

  if (!context.session.user.roles.includes("ADMIN")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "Esta operación está disponible sólo para administradores." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, context };
}

export function positiveUserId(value: unknown) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}
