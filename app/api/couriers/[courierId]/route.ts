import { NextResponse } from "next/server";

import { courierPayloadFromClient } from "@/app/lib/api/couriers";
import {
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import {
  deleteCourierForMerchant,
  getCourierForMerchant,
  updateCourierForMerchant,
} from "@/app/lib/services/commerce-services";

type CourierRouteContext = {
  params: Promise<{ courierId: string }>;
};

export async function GET(_request: Request, context: CourierRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { courierId } = await context.params;

  try {
    const courier = await getCourierForMerchant({
      accessToken: sessionContext.accessToken,
      courierId,
    });

    return NextResponse.json(courier);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar el repartidor.");
  }
}

export async function PATCH(request: Request, context: CourierRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { courierId } = await context.params;
  const payload = courierPayloadFromClient(await request.json().catch(() => null));

  try {
    const courier = await updateCourierForMerchant({
      accessToken: sessionContext.accessToken,
      courierId,
      payload: {
        ...(payload?.name ? { name: payload.name } : {}),
        ...(payload?.metadata !== undefined ? { metadata: payload.metadata } : {}),
      },
    });

    return NextResponse.json(courier);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el repartidor.");
  }
}

export async function DELETE(_request: Request, context: CourierRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { courierId } = await context.params;

  try {
    await deleteCourierForMerchant({
      accessToken: sessionContext.accessToken,
      courierId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo eliminar el repartidor.");
  }
}
