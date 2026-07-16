import { NextResponse } from "next/server";

import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { listNotificationUsers } from "@/app/lib/services/commerce-services";

export async function GET() {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const permissions = context.session.user.permissions;
  if (permissions.length && !permissions.includes("auth.users:read")) {
    return NextResponse.json(
      { message: "Tu cuenta no tiene permiso para consultar usuarios." },
      { status: 403 }
    );
  }

  try {
    const users = await listNotificationUsers({
      accessToken: context.accessToken,
    });

    return NextResponse.json(users);
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar el directorio de usuarios."
    );
  }
}
