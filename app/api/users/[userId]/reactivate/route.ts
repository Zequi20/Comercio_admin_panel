import { NextResponse } from "next/server";

import { getAdminApiContext, positiveUserId } from "@/app/lib/api/admin";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import { reactivateManagedUser } from "@/app/lib/services/auth-service";

type UserRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(_request: Request, route: UserRouteContext) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const userId = positiveUserId((await route.params).userId);
  if (!userId) return badRequestResponse("El ID del usuario no es válido.");

  try {
    await reactivateManagedUser({
      accessToken: admin.context.accessToken,
      userId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo reactivar el usuario.");
  }
}
