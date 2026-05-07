import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import {
  createOrderForMerchant,
  listOrdersForMerchant,
} from "@/app/lib/services/commerce-services";

export async function GET(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const { searchParams } = new URL(request.url);

  try {
    const orders = await listOrdersForMerchant({
      accessToken: context.accessToken,
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 30),
    });

    return NextResponse.json(orders);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar la lista de pedidos.");
  }
}

export async function POST(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const payload = orderPayloadFromClient(
    await request.json().catch(() => null),
    context.session.merchant.id
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
