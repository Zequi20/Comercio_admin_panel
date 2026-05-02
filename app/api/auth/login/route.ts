import { NextResponse } from "next/server";

import { createCommerceSessionFromLogin, setAuthCookies } from "@/app/lib/auth/session";
import { loginToAuthService } from "@/app/lib/services/auth-service";

type LoginRequest = {
  email?: string;
  password?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const body = (await request.json()) as LoginRequest;
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Ingresá un correo válido." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { message: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  try {
    const authPayload = await loginToAuthService(email, password);
    const commerceSession = await createCommerceSessionFromLogin(authPayload);

    if (!commerceSession.ok) {
      return NextResponse.json(
        { message: commerceSession.reason },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      user: commerceSession.session.user,
      merchant: commerceSession.session.merchant,
    });

    setAuthCookies(response, {
      accessToken: commerceSession.accessToken,
      refreshToken: commerceSession.refreshToken,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo iniciar sesión. Intentá nuevamente.";

    return NextResponse.json({ message }, { status: 401 });
  }
}
