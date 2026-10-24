import { NextResponse } from "next/server";

import {
  requestPasswordReset,
  ServiceRequestError,
} from "@/app/lib/services/auth-service";

type PasswordResetRequestBody = {
  email?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const body = (await request
    .json()
    .catch(() => ({}))) as PasswordResetRequestBody;
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Ingresá un correo válido." },
      { status: 400 }
    );
  }

  try {
    await requestPasswordReset(email);
    return NextResponse.json({ status: "accepted" }, { status: 202 });
  } catch (error) {
    if (error instanceof ServiceRequestError && error.status === 429) {
      return NextResponse.json(
        { message: "Demasiados intentos. Esperá unos minutos y volvé a intentar." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { message: "No se pudo enviar el código. Intentá nuevamente." },
      { status: 502 }
    );
  }
}
