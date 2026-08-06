import { NextResponse } from "next/server";

import { getAdminApiContext, positiveUserId } from "@/app/lib/api/admin";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import {
  isManagedUserRole,
  type ManagedUserRole,
} from "@/app/lib/auth/managed-users";
import { changeManagedUserRole } from "@/app/lib/services/auth-service";

async function changeRole(request: Request, method: "POST" | "DELETE") {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const userId = positiveUserId(body?.userId);
  const role =
    typeof body?.role === "string" ? body.role.trim().toUpperCase() : "";

  if (!userId) return badRequestResponse("El ID del usuario no es válido.");
  if (!isManagedUserRole(role)) {
    return badRequestResponse("Seleccioná un rol válido.");
  }

  if (
    method === "DELETE" &&
    role === "ADMIN" &&
    String(admin.context.session.user.id ?? "") === String(userId)
  ) {
    return NextResponse.json(
      { message: "No podés quitar tu propio rol ADMIN." },
      { status: 409 }
    );
  }

  try {
    const result = await changeManagedUserRole({
      accessToken: admin.context.accessToken,
      method,
      role: role as ManagedUserRole,
      userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return serviceErrorResponse(
      error,
      method === "POST"
        ? "No se pudo asignar el rol."
        : "No se pudo quitar el rol."
    );
  }
}

export async function POST(request: Request) {
  return changeRole(request, "POST");
}

export async function DELETE(request: Request) {
  return changeRole(request, "DELETE");
}
