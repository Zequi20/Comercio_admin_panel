import { NextResponse } from "next/server";

import {
  clearAuthCookies,
  getCommerceSessionFromCookies,
} from "@/app/lib/auth/session";

export async function GET() {
  const session = await getCommerceSessionFromCookies();

  if (!session) {
    const response = NextResponse.json(
      { message: "Sesión no válida o sin acceso comercio." },
      { status: 401 }
    );
    clearAuthCookies(response);
    return response;
  }

  return NextResponse.json(session);
}
