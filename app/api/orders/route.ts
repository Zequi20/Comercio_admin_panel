import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { orderPayloadFromClient } from "@/app/lib/api/orders";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { merchantIdFromMutation } from "@/app/lib/auth/mutation-merchant";
import { isCustomDeliveryOrder } from "@/app/lib/orders/order-type";
import { validateOrderItemsFulfillment } from "@/app/lib/orders/validate-order-fulfillment";
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
    const orderType = searchParams.get("orderType");
    const orders = context.isAdmin
      ? await listOrdersForAdminScope({
          accessToken: context.accessToken,
          merchantId:
            orderType === "CUSTOM"
              ? undefined
              : context.scope.merchantId ?? undefined,
          status,
        })
      : await listOrdersForMerchant({
          accessToken: context.accessToken,
          status,
          limit: Number(searchParams.get("limit") ?? 30),
        });

    if (orderType === "CUSTOM" || orderType === "CATALOG") {
      return NextResponse.json({
        ...orders,
        data: (orders.data ?? []).filter((order) =>
          orderType === "CUSTOM"
            ? isCustomDeliveryOrder(order)
            : !isCustomDeliveryOrder(order)
        ),
      });
    }

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

  const body = await request.json().catch(() => null);
  const merchantId = merchantIdFromMutation(
    context,
    body && typeof body === "object" && "merchantId" in body
      ? body.merchantId
      : null
  );

  if (!merchantId) {
    return badRequestResponse("Seleccioná el comercio de la nueva orden.");
  }

  const payload = orderPayloadFromClient(body, merchantId);

  if (!payload?.items.length) {
    return badRequestResponse("Agregá al menos un ítem al pedido.");
  }

  if (payload.fulfillmentType === "DELIVERY" && !payload.address?.trim()) {
    return badRequestResponse("Ingresá la dirección de entrega.");
  }

  try {
    const fulfillmentError = await validateOrderItemsFulfillment({
      accessToken: context.accessToken,
      fulfillmentType: payload.fulfillmentType ?? "DELIVERY",
      items: payload.items,
    });

    if (fulfillmentError) {
      return badRequestResponse(fulfillmentError);
    }

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
