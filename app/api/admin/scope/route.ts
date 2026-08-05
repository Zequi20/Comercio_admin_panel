import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { setAdminScopeCookie } from "@/app/lib/auth/portal-scope";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { fetchMerchantDetails } from "@/app/lib/services/auth-service";

type ScopeBody = {
  merchantId?: unknown;
};

export async function POST(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  if (!context.session.user.roles.includes("ADMIN")) {
    return NextResponse.json(
      { message: "Solo un administrador puede cambiar el alcance del portal." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as ScopeBody | null;
  const rawMerchantId = body?.merchantId;

  if (rawMerchantId === null || rawMerchantId === "all") {
    const response = NextResponse.json({
      scope: { mode: "global", merchantId: null, merchant: null },
    });
    setAdminScopeCookie(response, null);
    return response;
  }

  const merchantId = String(rawMerchantId ?? "").trim();
  if (!/^\d+$/.test(merchantId)) {
    return badRequestResponse("Seleccioná un comercio válido.");
  }

  try {
    const merchant = await fetchMerchantDetails(merchantId, context.accessToken);
    const response = NextResponse.json({
      scope: {
        mode: "merchant",
        merchantId: merchant.id,
        merchant,
      },
    });
    setAdminScopeCookie(response, merchant.id);
    return response;
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo seleccionar el comercio.");
  }
}
