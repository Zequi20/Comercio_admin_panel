import { NextResponse } from "next/server";

import { orderItemsPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { updateOrderItemsForMerchant } from "@/app/lib/services/commerce-services";

type OrderItemsRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(request: Request, context: OrderItemsRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const body = orderItemsPayloadFromClient(await request.json().catch(() => null));

  if (!body?.items.length) {
    return badRequestResponse("Agregá al menos un ítem al pedido.");
  }

  if (typeof body.expectedVersion !== "number") {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const order = await updateOrderItemsForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: {
        expectedVersion: body.expectedVersion,
        items: body.items,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudieron actualizar los ítems del pedido."
    );
  }
}
