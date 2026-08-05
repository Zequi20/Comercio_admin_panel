import { NextResponse } from "next/server";

import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { listMerchantDirectory } from "@/app/lib/services/auth-service";

export async function GET() {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  if (!context.session.user.roles.includes("ADMIN")) {
    return NextResponse.json(
      { message: "Solo un administrador puede consultar todos los comercios." },
      { status: 403 }
    );
  }

  try {
    const merchants = await listMerchantDirectory(context.accessToken);
    return NextResponse.json({ data: merchants });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar la lista de comercios.");
  }
}
