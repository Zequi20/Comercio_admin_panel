import { NextResponse } from "next/server";

import { productPayloadFromClient } from "@/app/lib/api/products";
import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import {
  deleteProductForMerchant,
  getProductForMerchant,
  updateProductForMerchant,
} from "@/app/lib/services/commerce-services";

type ProductRouteContext = {
  params: Promise<{ productId: string }>;
};

export async function GET(_request: Request, context: ProductRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { productId } = await context.params;

  try {
    const product = await getProductForMerchant({
      accessToken: sessionContext.accessToken,
      productId,
    });

    return NextResponse.json(product);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar el producto.");
  }
}

export async function PATCH(request: Request, context: ProductRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { productId } = await context.params;
  const payload = productPayloadFromClient(await request.json().catch(() => null));

  try {
    const product = await updateProductForMerchant({
      accessToken: sessionContext.accessToken,
      productId,
      payload: payload ?? {},
    });

    return NextResponse.json(product);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el producto.");
  }
}

export async function DELETE(_request: Request, context: ProductRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { productId } = await context.params;

  try {
    await deleteProductForMerchant({
      accessToken: sessionContext.accessToken,
      productId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo eliminar el producto.");
  }
}
