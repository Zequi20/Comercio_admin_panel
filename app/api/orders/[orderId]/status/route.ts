import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { updateOrderStatusForMerchant } from "@/app/lib/services/commerce-services";

const allowedStatuses = new Set([
  "CONFIRMED",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "CANCELED",
]);

type OrderStatusRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(request: Request, context: OrderStatusRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const body = (await request.json().catch(() => null)) as
    | { toStatus?: string; expectedVersion?: number }
    | null;
  const toStatus =
    body?.toStatus === "CANCELLED" ? "CANCELED" : body?.toStatus;

  if (!toStatus || !allowedStatuses.has(toStatus)) {
    return badRequestResponse("Estado de pedido inválido.");
  }

  if (typeof body?.expectedVersion !== "number") {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const order = await updateOrderStatusForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: {
        toStatus,
        expectedVersion: body.expectedVersion,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el pedido.");
  }
}
