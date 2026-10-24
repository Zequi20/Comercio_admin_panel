import { NextResponse } from "next/server";

import { createCommerceSessionFromLogin, setAuthCookies } from "@/app/lib/auth/session";
import {
  confirmPasswordReset,
  loginToAuthService,
  ServiceRequestError,
} from "@/app/lib/services/auth-service";

type PasswordResetConfirmBody = {
  email?: string;
  code?: string;
  newPassword?: string;
};

const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// El servicio responde en inglés; el texto se decide por status + title.
function confirmErrorMessage(error: unknown) {
  if (!(error instanceof ServiceRequestError)) {
    return "No se pudo cambiar la contraseña. Intentá nuevamente.";
  }

  if (error.status === 429) {
    return "Demasiados intentos. Esperá unos minutos y volvé a intentar.";
  }

  if (error.status === 400 && error.title === "Invalid code") {
    return "El código no es correcto.";
  }

  if (error.status === 400) {
    return "El código venció o ya no es válido. Pedí uno nuevo.";
  }

  return "No se pudo cambiar la contraseña. Intentá nuevamente.";
}

export async function POST(request: Request) {
  const body = (await request
    .json()
    .catch(() => ({}))) as PasswordResetConfirmBody;
  const email = body.email?.trim().toLowerCase() ?? "";
  const code = body.code?.trim() ?? "";
  const newPassword = body.newPassword ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Ingresá un correo válido." },
      { status: 400 }
    );
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { message: "El código tiene 6 dígitos." },
      { status: 400 }
    );
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { message: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  try {
    await confirmPasswordReset({ email, code, newPassword });
  } catch (error) {
    const status =
      error instanceof ServiceRequestError && error.status < 500
        ? error.status
        : 502;

    return NextResponse.json(
      { message: confirmErrorMessage(error) },
      { status }
    );
  }

  // La contraseña ya cambió: si el inicio de sesión automático falla, se entra desde el login.
  try {
    const authPayload = await loginToAuthService(email, newPassword);
    const commerceSession = await createCommerceSessionFromLogin(authPayload);

    if (!commerceSession.ok) {
      return NextResponse.json({
        loggedIn: false,
        message: commerceSession.reason,
      });
    }

    const response = NextResponse.json({ loggedIn: true });

    setAuthCookies(response, {
      accessToken: commerceSession.accessToken,
      refreshToken: commerceSession.refreshToken,
    });

    return response;
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}
