import { NextResponse } from "next/server";

import { courierPayloadFromClient } from "@/app/lib/api/couriers";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  createCourierUser,
  createUniversalCourier,
  listAllFavoriteCouriers,
  listAllUniversalCouriers,
} from "@/app/lib/services/commerce-services";

export async function GET() {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  try {
    const [couriers, favorites] = await Promise.all([
      listAllUniversalCouriers({ accessToken: context.accessToken }),
      context.scope.mode === "merchant"
        ? listAllFavoriteCouriers({
            accessToken: context.accessToken,
            merchantId: context.scope.merchantId,
          })
        : Promise.resolve({ data: [], cursor: null, truncated: false }),
    ]);
    const favoriteCourierIds = new Set(
      favorites.data.map((favorite) => String(favorite.courier.id))
    );

    return NextResponse.json({
      ...couriers,
      truncated: couriers.truncated || favorites.truncated,
      merchantId:
        context.scope.mode === "merchant" ? context.scope.merchantId : null,
      favoritesEnabled: context.scope.mode === "merchant",
      favoriteCount: favoriteCourierIds.size,
      data: couriers.data.map((courier) => ({
        ...courier,
        isFavorite: favoriteCourierIds.has(String(courier.id)),
      })),
    });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar la lista de repartidores."
    );
  }
}

export async function POST(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  if (!context.isAdmin) {
    return NextResponse.json(
      { message: "Solo un administrador puede crear repartidores universales." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const payload = courierPayloadFromClient(body);

  if (!payload?.name) {
    return badRequestResponse("Ingresá el nombre del repartidor.");
  }

  if (!payload.email) {
    return badRequestResponse("Ingresá el email del usuario repartidor.");
  }

  if (!payload.password || payload.password.length < 8) {
    return badRequestResponse("La contraseña debe tener al menos 8 caracteres.");
  }

  try {
    const createdUser = await createCourierUser({
      payload: {
        email: payload.email,
        password: payload.password,
        nickname: payload.nickname ?? payload.name,
        ...(payload.phone ? { phone: payload.phone } : {}),
      },
    });
    const userId = Number(createdUser.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("El servicio no devolvió el usuario creado.");
    }

    const courier = await createUniversalCourier({
      accessToken: context.accessToken,
      payload: {
        userId,
        name: payload.name,
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
      },
    });

    return NextResponse.json(courier, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el repartidor.");
  }
}
