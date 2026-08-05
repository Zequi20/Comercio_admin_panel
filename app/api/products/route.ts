import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { productPayloadFromClient } from "@/app/lib/api/products";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  createProductForMerchant,
  listProductsForAdminScope,
  listProductsForMerchant,
} from "@/app/lib/services/commerce-services";

export async function GET(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const { searchParams } = new URL(request.url);

  try {
    const filters = {
      accessToken: context.accessToken,
      merchantId: context.scope.merchantId ?? undefined,
      type: searchParams.get("type") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      available: searchParams.get("available") ?? undefined,
      availabilityStatus: searchParams.get("availabilityStatus") ?? undefined,
    };
    const products = context.isAdmin
      ? await listProductsForAdminScope(filters)
      : await listProductsForMerchant({
          ...filters,
          limit: Number(searchParams.get("limit") ?? 30),
        });

    return NextResponse.json(products);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar el catálogo.");
  }
}

export async function POST(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  if (context.scope.mode !== "merchant") {
    return badRequestResponse(
      "Seleccioná un comercio antes de agregar un producto."
    );
  }

  const payload = productPayloadFromClient(await request.json().catch(() => null));

  if (!payload?.name) {
    return badRequestResponse("Ingresá el nombre del producto o servicio.");
  }

  if (payload.price === undefined || Number(payload.price) < 0) {
    return badRequestResponse("Ingresá un precio válido.");
  }

  try {
    const product = await createProductForMerchant({
      accessToken: context.accessToken,
      merchantId: context.scope.merchantId,
      payload,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? randomUUID(),
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el producto.");
  }
}
