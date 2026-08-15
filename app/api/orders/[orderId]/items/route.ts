import { NextResponse } from "next/server";

import { orderItemsPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { validateOrderItemsFulfillment } from "@/app/lib/orders/validate-order-fulfillment";
import {
  getOrderForMerchant,
  updateOrderItemsForMerchant,
} from "@/app/lib/services/commerce-services";

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
    const currentOrder = await getOrderForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
    });
    const currentVersion = Number(currentOrder.version);

    if (
      !Number.isInteger(currentVersion) ||
      currentVersion !== body.expectedVersion
    ) {
      return badRequestResponse(
        "El pedido fue actualizado. Recargá la tabla antes de agregar ítems."
      );
    }

    const fulfillmentError = await validateOrderItemsFulfillment({
      accessToken: sessionContext.accessToken,
      fulfillmentType: currentOrder.fulfillmentType ?? "DELIVERY",
      items: [...(currentOrder.items ?? []), ...body.items],
    });

    if (fulfillmentError) {
      return badRequestResponse(fulfillmentError);
    }

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
