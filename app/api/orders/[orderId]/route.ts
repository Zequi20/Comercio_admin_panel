import { NextResponse } from "next/server";

import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { getOrderForMerchant } from "@/app/lib/services/commerce-services";

type OrderRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_request: Request, context: OrderRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { orderId } = await context.params;

  try {
    const order = await getOrderForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
    });

    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar el pedido.");
  }
}
