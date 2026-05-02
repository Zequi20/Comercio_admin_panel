import { NextResponse } from "next/server";

import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { listOrdersForMerchant } from "@/app/lib/services/commerce-services";

export async function GET(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const { searchParams } = new URL(request.url);

  try {
    const orders = await listOrdersForMerchant({
      accessToken: context.accessToken,
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 30),
    });

    return NextResponse.json(orders);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar la lista de pedidos.");
  }
}
