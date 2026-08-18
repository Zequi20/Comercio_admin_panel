import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { confirmCustomOrderPrice } from "@/app/lib/services/commerce-services";

type OrderPriceRouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(request: Request, context: OrderPriceRouteContext) {
  const sessionContext = await getScopedCommerceRequestContextFromCookies();

  if (!sessionContext) return unauthorizedCommerceResponse();
  if (!sessionContext.isAdmin) {
    return NextResponse.json(
      { message: "Sólo un administrador puede confirmar este precio." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const total = Number(body?.total);
  const expectedVersion = Number(body?.expectedVersion);

  if (!Number.isFinite(total) || total <= 0) {
    return badRequestResponse("Ingresá un precio final mayor a cero.");
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return badRequestResponse("La versión esperada del pedido es requerida.");
  }

  const { orderId } = await context.params;

  try {
    const order = await confirmCustomOrderPrice({
      accessToken: sessionContext.accessToken,
      orderId,
      payload: { total, expectedVersion },
    });
    return NextResponse.json(order);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo confirmar el precio final.");
  }
}
