import { NextResponse } from "next/server";

import { getAdminApiContext, positiveUserId } from "@/app/lib/api/admin";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import { updateManagedUserPassword } from "@/app/lib/services/auth-service";

type UserPasswordRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(
  request: Request,
  route: UserPasswordRouteContext
) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const userId = positiveUserId((await route.params).userId);
  if (!userId) return badRequestResponse("El ID del usuario no es válido.");

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const newPassword =
    body && typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return badRequestResponse("La contraseña debe tener al menos 8 caracteres.");
  }

  try {
    await updateManagedUserPassword({
      accessToken: admin.context.accessToken,
      newPassword,
      userId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cambiar la contraseña del usuario."
    );
  }
}
