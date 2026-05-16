import { NextResponse } from "next/server";

import { orderAssignmentPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { assignOrderCourierForMerchant } from "@/app/lib/services/commerce-services";

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
