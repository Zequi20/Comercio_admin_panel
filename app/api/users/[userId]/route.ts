import { NextResponse } from "next/server";

import { getAdminApiContext, positiveUserId } from "@/app/lib/api/admin";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import {
  deactivateManagedUser,
  updateManagedUser,
  type ManagedUserUpdatePayload,
} from "@/app/lib/services/auth-service";

type UserRouteContext = {
  params: Promise<{ userId: string }>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request, route: UserRouteContext) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const userId = positiveUserId((await route.params).userId);
  if (!userId) return badRequestResponse("El ID del usuario no es válido.");

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) return badRequestResponse("Enviá los cambios del usuario.");

  const payload: ManagedUserUpdatePayload = {};

  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!emailPattern.test(email)) {
      return badRequestResponse("Ingresá un correo válido.");
    }
    payload.email = email;
  }

  if ("nickname" in body) {
    payload.nickname =
      typeof body.nickname === "string" && body.nickname.trim()
        ? body.nickname.trim()
        : null;
  }

  if ("phone" in body) {
    payload.phone =
      typeof body.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : null;
  }

  if ("merchantId" in body) {
    if (body.merchantId === null || body.merchantId === "") {
      payload.merchantId = null;
    } else {
      const merchantId = positiveUserId(body.merchantId);
      if (!merchantId) {
        return badRequestResponse("Seleccioná un comercio válido.");
      }
      payload.merchantId = merchantId;
    }
  }

  if (Object.keys(payload).length === 0) {
    return badRequestResponse("No hay cambios válidos para actualizar.");
  }

  try {
    const user = await updateManagedUser({
      accessToken: admin.context.accessToken,
      payload,
      userId,
    });
    return NextResponse.json(user);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el usuario.");
  }
}

export async function DELETE(_request: Request, route: UserRouteContext) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const userId = positiveUserId((await route.params).userId);
  if (!userId) return badRequestResponse("El ID del usuario no es válido.");

  if (String(admin.context.session.user.id ?? "") === String(userId)) {
    return NextResponse.json(
      { message: "No podés desactivar tu propia cuenta administrativa." },
      { status: 409 }
    );
  }

  try {
    await deactivateManagedUser({
      accessToken: admin.context.accessToken,
      userId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo desactivar el usuario.");
  }
}
