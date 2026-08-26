import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  addFavoriteCourier,
  removeFavoriteCourier,
} from "@/app/lib/services/commerce-services";

type FavoriteCourierRouteContext = {
  params: Promise<{ merchantId: string; courierId: string }>;
};

function positiveId(value: unknown) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

async function favoriteRouteContext(route: FavoriteCourierRouteContext) {
  const context = await getScopedCommerceRequestContextFromCookies();
  if (!context) return { ok: false as const, response: unauthorizedCommerceResponse() };

  const params = await route.params;
  const merchantId = positiveId(params.merchantId);
  const courierId = positiveId(params.courierId);

  if (!merchantId || !courierId) {
    return {
      ok: false as const,
      response: badRequestResponse("El comercio o el repartidor no es válido."),
    };
  }

  if (
    context.scope.mode !== "merchant" ||
    String(context.scope.merchantId) !== String(merchantId)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: "Seleccioná el comercio antes de modificar sus favoritos." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, context, merchantId, courierId };
}

export async function PUT(_request: Request, route: FavoriteCourierRouteContext) {
  const scoped = await favoriteRouteContext(route);
  if (!scoped.ok) return scoped.response;

  try {
    const favorite = await addFavoriteCourier({
      accessToken: scoped.context.accessToken,
      merchantId: scoped.merchantId,
      courierId: scoped.courierId,
    });

    return NextResponse.json(favorite);
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo marcar el repartidor como favorito."
    );
  }
}

export async function DELETE(
  _request: Request,
  route: FavoriteCourierRouteContext
) {
  const scoped = await favoriteRouteContext(route);
  if (!scoped.ok) return scoped.response;

  try {
    await removeFavoriteCourier({
      accessToken: scoped.context.accessToken,
      merchantId: scoped.merchantId,
      courierId: scoped.courierId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo quitar el repartidor de favoritos."
    );
  }
}
