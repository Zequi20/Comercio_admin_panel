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
import {
  createManagedUser,
  listManagedUsers,
} from "@/app/lib/services/auth-service";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  try {
    return NextResponse.json(
      await listManagedUsers(admin.context.accessToken)
    );
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudo cargar el directorio de usuarios."
    );
  }
}

export async function POST(request: Request) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) return badRequestResponse("Enviá los datos del usuario.");

  const email = normalizedText(body.email).toLowerCase();
  const password = normalizedText(body.password);
  const nickname = normalizedText(body.nickname);
  const phone = normalizedText(body.phone);
  const normalizedRole = normalizedText(body.role).toUpperCase();

  if (!emailPattern.test(email)) {
    return badRequestResponse("Ingresá un correo válido.");
  }
  if (!nickname) {
    return badRequestResponse("Ingresá el nombre del usuario.");
  }
  if (password.length < 8) {
    return badRequestResponse("La contraseña debe tener al menos 8 caracteres.");
  }
  if (!isManagedUserRole(normalizedRole)) {
    return badRequestResponse("Seleccioná un rol válido.");
  }

  const hasMerchantId =
    body.merchantId !== undefined &&
    body.merchantId !== null &&
    body.merchantId !== "";
  const merchantId =
    !hasMerchantId
      ? null
      : positiveUserId(body.merchantId);
  if (hasMerchantId && merchantId === null) {
    return badRequestResponse("Seleccioná un comercio válido.");
  }

  try {
    const user = await createManagedUser({
      accessToken: admin.context.accessToken,
      idempotencyKey:
        request.headers.get("Idempotency-Key") ?? crypto.randomUUID(),
      payload: {
        email,
        password,
        nickname,
        role: normalizedRole as ManagedUserRole,
        ...(phone ? { phone } : {}),
        ...(merchantId !== null ? { merchantId } : {}),
      },
    });

    if (!user) {
      throw new Error("El servicio no devolvió el usuario creado.");
    }

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el usuario.");
  }
}
