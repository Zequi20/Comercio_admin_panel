import { NextResponse } from "next/server";

import { getOrderStatusContract } from "@/app/lib/services/commerce-services";
import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";

export async function GET() {
  const context = await getScopedCommerceRequestContextFromCookies();
  if (!context) return unauthorizedCommerceResponse();

  try {
    const contract = await getOrderStatusContract({
      accessToken: context.accessToken,
    });
    return NextResponse.json(contract, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar el contrato de estados del pedido."
    );
  }
}
