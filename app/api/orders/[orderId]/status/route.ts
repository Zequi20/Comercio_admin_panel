import { NextResponse } from "next/server";

import { orderStatusPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { isCustomDeliveryOrder } from "@/app/lib/orders/order-type";
import {
  canTransitionOrderStatus,
  statusTransitionBlockedReason,
} from "@/app/lib/order-status";
import {
  getOrderForMerchant,
  updateOrderStatusForMerchant,
} from "@/app/lib/services/commerce-services";

type OrderStatusRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(request: Request, context: OrderStatusRouteContext) {
  const sessionContext = await getScopedCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const body = orderStatusPayloadFromClient(
    await request.json().catch(() => null)
  );

  if (!body?.toStatus || body.toStatus === "PLACED") {
    return badRequestResponse("Estado de pedido inválido.");
  }

  if (typeof body?.expectedVersion !== "number") {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const orderDetail = await getOrderForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
    });

    if (
      sessionContext.scope.mode === "global" &&
      (!sessionContext.isAdmin || !isCustomDeliveryOrder(orderDetail))
    ) {
      return NextResponse.json(
        {
          message:
            "En Todos los comercios sólo se puede actualizar el estado de entregas custom.",
        },
        { status: 403 }
      );
    }

    const currentVersion = Number(orderDetail.version);

    if (
      !Number.isInteger(currentVersion) ||
      currentVersion !== body.expectedVersion
    ) {
      return badRequestResponse(
        "El pedido fue actualizado. Recargá la tabla antes de cambiar el estado."
      );
    }

    if (!canTransitionOrderStatus(orderDetail, body.toStatus)) {
      return badRequestResponse(
        statusTransitionBlockedReason(orderDetail, body.toStatus)
      );
    }

    const order = await updateOrderStatusForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: {
        toStatus: body.toStatus,
        expectedVersion: body.expectedVersion,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el pedido.");
  }
}
