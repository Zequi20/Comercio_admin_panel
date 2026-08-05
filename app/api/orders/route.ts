import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  createOrderForMerchant,
  listOrdersForAdminScope,
  listOrdersForMerchant,
} from "@/app/lib/services/commerce-services";

export async function GET(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const { searchParams } = new URL(request.url);

  try {
    const status = searchParams.get("status") ?? undefined;
    const orders = context.isAdmin
      ? await listOrdersForAdminScope({
          accessToken: context.accessToken,
          merchantId: context.scope.merchantId ?? undefined,
          status,
        })
      : await listOrdersForMerchant({
          accessToken: context.accessToken,
          status,
          limit: Number(searchParams.get("limit") ?? 30),
        });

    return NextResponse.json(orders);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar la lista de pedidos.");
  }
}

export async function POST(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  if (context.scope.mode !== "merchant") {
    return badRequestResponse(
      "Seleccioná un comercio antes de crear una orden."
    );
  }

  const payload = orderPayloadFromClient(
    await request.json().catch(() => null),
    context.scope.merchantId
  );

  if (!payload?.items.length) {
    return badRequestResponse("Agregá al menos un ítem al pedido.");
  }

  if (payload.fulfillmentType === "DELIVERY" && !payload.address?.trim()) {
    return badRequestResponse("Ingresá la dirección de entrega.");
  }

  try {
    const order = await createOrderForMerchant({
      accessToken: context.accessToken,
      payload,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? randomUUID(),
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el pedido.");
  }
}
