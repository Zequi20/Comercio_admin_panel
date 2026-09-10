import { NextResponse } from "next/server";

import { orderEstimatedDeliveryPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { canEditEstimatedDelivery } from "@/app/lib/orders/estimated-delivery";
import {
  getOrderForMerchant,
  updateEstimatedDeliveryForMerchant,
} from "@/app/lib/services/commerce-services";

type EstimatedDeliveryRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(
  request: Request,
  context: EstimatedDeliveryRouteContext
) {
  const sessionContext = await getScopedCommerceRequestContextFromCookies();

  if (!sessionContext) return unauthorizedCommerceResponse();

  const body = orderEstimatedDeliveryPayloadFromClient(
    await request.json().catch(() => null)
  );
  const parsedEstimate = Date.parse(body?.estimatedDeliveryAt ?? "");

  if (!Number.isFinite(parsedEstimate) || parsedEstimate <= Date.now()) {
    return badRequestResponse("La fecha y hora estimadas deben estar en el futuro.");
  }
  if (!Number.isInteger(body?.expectedVersion)) {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const currentOrder = await getOrderForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
    });
    const currentVersion = Number(currentOrder.version);

    if (currentVersion !== body!.expectedVersion) {
      return badRequestResponse(
        "El pedido fue actualizado. Recargá la tabla antes de cambiar la estimación."
      );
    }
    if (!canEditEstimatedDelivery(currentOrder.status)) {
      return badRequestResponse(
        "La estimación no puede cambiarse en un pedido finalizado."
      );
    }

    const order = await updateEstimatedDeliveryForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: {
        estimatedDeliveryAt: new Date(parsedEstimate).toISOString(),
        expectedVersion: body!.expectedVersion!,
      },
    });
    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo actualizar la hora estimada del pedido."
    );
  }
}
