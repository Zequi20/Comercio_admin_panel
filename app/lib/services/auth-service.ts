import "server-only";

import { extractErrorMessage, parseJsonSafely } from "../problem-details";
import type {
  AuthLoginResponse,
  AuthUser,
  MerchantDetails,
} from "../auth/types";
import { serviceUrls } from "../env";

const AUTH_BASE_URL = serviceUrls.auth;

async function requestJson<T>(
  input: string,
  init: RequestInit,
  fallbackError: string
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await response.text();
  const parsed = text ? parseJsonSafely(text) : null;

  if (!response.ok) {
    throw new Error(extractErrorMessage(parsed ?? text, fallbackError));
  }

  if (!text) {
    return {} as T;
  }

  if (parsed === null) {
    throw new Error("El servicio respondió con un formato inesperado.");
  }

  return parsed as T;
}

export async function loginToAuthService(email: string, password: string) {
  return requestJson<AuthLoginResponse>(
    `${AUTH_BASE_URL}/auth/login`,
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    "No se pudo iniciar sesión."
  );
}

export async function fetchAuthProfile(accessToken: string) {
  return requestJson<AuthUser>(
    `${AUTH_BASE_URL}/auth/me?expand=merchant`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    "No se pudo cargar el perfil."
  );
}

export async function fetchMerchantDetails(
  merchantId: number | string,
  accessToken: string
) {
  return requestJson<MerchantDetails>(
    `${AUTH_BASE_URL}/merchants/${merchantId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    "No se pudo cargar el comercio."
  );
}

export async function logoutFromAuthService(refreshToken: string) {
  await requestJson<unknown>(
    `${AUTH_BASE_URL}/auth/logout`,
    {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    },
    "No se pudo cerrar sesión."
  );
}
