import { NextResponse } from "next/server";

import { orderAssignmentPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import {
  assignmentBlockedReason,
  canAssignCourierToOrder,
} from "@/app/lib/order-status";
import {
  assignOrderCourierForMerchant,
  getOrderForMerchant,
  getUniversalCourier,
} from "@/app/lib/services/commerce-services";

type OrderAssignRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function POST(request: Request, context: OrderAssignRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const body = orderAssignmentPayloadFromClient(
    await request.json().catch(() => null)
  );

  if (!body?.courierId) {
    return badRequestResponse("Seleccioná un repartidor válido.");
  }

  if (typeof body.expectedVersion !== "number") {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const [orderDetail, courierDetail] = await Promise.all([
      getOrderForMerchant({
        accessToken: sessionContext.accessToken,
        orderId,
      }),
      getUniversalCourier({
        accessToken: sessionContext.accessToken,
        courierId: body.courierId,
      }),
    ]);

    if (!canAssignCourierToOrder(orderDetail)) {
      return badRequestResponse(
        assignmentBlockedReason(orderDetail) ??
          "La orden no está disponible para asignación."
      );
    }

    if (!courierDetail.isActive) {
      return badRequestResponse("El repartidor seleccionado no está activo.");
    }

    const currentVersion = Number(orderDetail.version);

    if (
      !Number.isInteger(currentVersion) ||
      currentVersion !== body.expectedVersion
    ) {
      return badRequestResponse(
        "El pedido fue actualizado. Recargá la tabla antes de asignar."
      );
    }

    const order = await assignOrderCourierForMerchant({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: {
        courierId: body.courierId,
        expectedVersion: body.expectedVersion,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo asignar el repartidor.");
  }
}
