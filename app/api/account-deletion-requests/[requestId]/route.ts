import { NextResponse } from "next/server";

import { getAdminApiContext, positiveUserId } from "@/app/lib/api/admin";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import {
  resolveAccountDeletionRequest,
  ServiceRequestError,
} from "@/app/lib/services/auth-service";

type DeletionRequestRouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(
  request: Request,
  route: DeletionRequestRouteContext
) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const requestId = positiveUserId((await route.params).requestId);
  if (!requestId) return badRequestResponse("El ID de la solicitud no es válido.");

  const body = (await request.json().catch(() => null)) as
    | { status?: unknown }
    | null;
  const status = body?.status;
  if (status !== "COMPLETED" && status !== "REJECTED") {
    return badRequestResponse("Indicá si la baja se completa o se rechaza.");
  }

  try {
    return NextResponse.json(
      await resolveAccountDeletionRequest({
        accessToken: admin.context.accessToken,
        requestId,
        status,
      })
    );
  } catch (error) {
    if (error instanceof ServiceRequestError && error.status === 409) {
      return NextResponse.json(
        { message: "La solicitud ya fue resuelta por otro administrador." },
        { status: 409 }
      );
    }
    if (error instanceof ServiceRequestError && error.status === 404) {
      return NextResponse.json(
        { message: "La solicitud de baja no existe." },
        { status: 404 }
      );
    }
    return serviceErrorResponse(error, "No se pudo resolver la solicitud de baja.");
  }
}
