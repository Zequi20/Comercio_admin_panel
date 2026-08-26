import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { listAllFavoriteCouriers } from "@/app/lib/services/commerce-services";

type FavoriteCouriersRouteContext = {
  params: Promise<{ merchantId: string }>;
};

function positiveId(value: unknown) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export async function GET(
  _request: Request,
  route: FavoriteCouriersRouteContext
) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const merchantId = positiveId((await route.params).merchantId);
  if (!merchantId) {
    return badRequestResponse("El ID del comercio no es válido.");
  }

  if (
    context.scope.mode !== "merchant" ||
    String(context.scope.merchantId) !== String(merchantId)
  ) {
    return NextResponse.json(
      { message: "Seleccioná el comercio antes de consultar sus favoritos." },
      { status: 403 }
    );
  }

  try {
    return NextResponse.json(
      await listAllFavoriteCouriers({
        accessToken: context.accessToken,
        merchantId,
      })
    );
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar la lista de repartidores favoritos."
    );
  }
}
