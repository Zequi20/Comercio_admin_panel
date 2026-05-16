import { NextResponse } from "next/server";

import { courierPayloadFromClient } from "@/app/lib/api/couriers";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import {
  createCourierForMerchant,
  createCourierUser,
  listCouriersForMerchant,
} from "@/app/lib/services/commerce-services";

export async function GET(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const { searchParams } = new URL(request.url);

  try {
    const couriers = await listCouriersForMerchant({
      accessToken: context.accessToken,
      limit: Number(searchParams.get("limit") ?? 100),
    });

    return NextResponse.json(couriers);
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar la lista de repartidores."
    );
  }
}

export async function POST(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const payload = courierPayloadFromClient(await request.json().catch(() => null));

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

    const courier = await createCourierForMerchant({
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
