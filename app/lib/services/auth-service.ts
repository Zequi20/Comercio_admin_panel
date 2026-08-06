import "server-only";

import { extractErrorMessage, parseJsonSafely } from "../problem-details";
import type {
  AuthLoginResponse,
  AuthUser,
  MerchantDetails,
} from "../auth/types";
import type {
  ManagedUser,
  ManagedUserRole,
  ManagedUsersPage,
} from "../auth/managed-users";
import { serviceUrls } from "../env";

const AUTH_BASE_URL = serviceUrls.auth;

type MerchantListResponse = {
  data?: MerchantDetails[];
  cursor?: number | string | null;
};

type ManagedUserRegistrationResponse = {
  user?: ManagedUser;
};

export type ManagedUserCreatePayload = {
  email: string;
  password: string;
  nickname: string;
  phone?: string;
  role: ManagedUserRole;
  merchantId?: number | string;
};

export type ManagedUserUpdatePayload = {
  email?: string;
  nickname?: string | null;
  phone?: string | null;
};

export type ManagedRoleChangeResponse = {
  user?: ManagedUser;
  changed?: boolean;
};

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

export async function refreshAuthSession(refreshToken: string) {
  return requestJson<AuthLoginResponse>(
    `${AUTH_BASE_URL}/auth/refresh`,
    {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    },
    "No se pudo renovar la sesión."
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

export async function listMerchantDirectory(accessToken: string) {
  const pageSize = 100;
  const maxMerchants = 2_000;
  const merchants: MerchantDetails[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;

  while (merchants.length < maxMerchants) {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (cursor !== undefined) {
      params.set("cursor", String(cursor));
    }

    const response = await requestJson<MerchantListResponse>(
      `${AUTH_BASE_URL}/merchants?${params.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      "No se pudo cargar la lista de comercios."
    );

    for (const merchant of response.data ?? []) {
      const id = String(merchant.id);
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      merchants.push(merchant);
    }

    const nextCursor = response.cursor;
    const cursorKey = nextCursor === null || nextCursor === undefined
      ? ""
      : String(nextCursor);

    if (
      (response.data?.length ?? 0) < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  return merchants.sort((first, second) =>
    (first.name ?? `Comercio ${first.id}`).localeCompare(
      second.name ?? `Comercio ${second.id}`,
      "es"
    )
  );
}

export async function updateMerchantDetails({
  accessToken,
  merchantId,
  payload,
}: {
  accessToken: string;
  merchantId: number | string;
  payload: Partial<Pick<MerchantDetails, "isOpen" | "metadata">>;
}) {
  return requestJson<MerchantDetails>(
    `${AUTH_BASE_URL}/merchants/${merchantId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
    "No se pudo actualizar el comercio."
  );
}

export async function listManagedUsers(accessToken: string) {
  const pageSize = 100;
  const maxUsers = 2_000;
  const users: ManagedUser[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;
  let truncated = false;

  while (users.length < maxUsers) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      expand: "merchant,courier",
    });
    if (cursor !== undefined) {
      params.set("cursor", String(cursor));
    }

    const response = await requestJson<ManagedUsersPage>(
      `${AUTH_BASE_URL}/users?${params.toString()}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      "No se pudo cargar el directorio de usuarios."
    );
    const page = response.data ?? response.users ?? [];

    for (const user of page) {
      const id = String(user.id ?? "");
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      users.push(user);
    }

    const nextCursor = response.cursor;
    const cursorKey =
      nextCursor === null || nextCursor === undefined ? "" : String(nextCursor);

    if (
      page.length < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    if (users.length >= maxUsers) {
      truncated = true;
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  return {
    data: users.slice(0, maxUsers),
    truncated,
  };
}

export async function createManagedUser({
  accessToken,
  idempotencyKey,
  payload,
}: {
  accessToken: string;
  idempotencyKey: string;
  payload: ManagedUserCreatePayload;
}) {
  const response = await requestJson<ManagedUserRegistrationResponse>(
    `${AUTH_BASE_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
    "No se pudo crear el usuario."
  );

  return response.user ?? null;
}

export async function updateManagedUser({
  accessToken,
  payload,
  userId,
}: {
  accessToken: string;
  payload: ManagedUserUpdatePayload;
  userId: number | string;
}) {
  return requestJson<ManagedUser>(
    `${AUTH_BASE_URL}/users/${encodeURIComponent(String(userId))}?expand=merchant,courier`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    },
    "No se pudo actualizar el usuario."
  );
}

export async function deactivateManagedUser({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: number | string;
}) {
  await requestJson<unknown>(
    `${AUTH_BASE_URL}/users/${encodeURIComponent(String(userId))}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    "No se pudo desactivar el usuario."
  );
}

export async function reactivateManagedUser({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: number | string;
}) {
  await requestJson<unknown>(
    `${AUTH_BASE_URL}/users/${encodeURIComponent(String(userId))}/reactivate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    "No se pudo reactivar el usuario."
  );
}

export async function changeManagedUserRole({
  accessToken,
  method,
  role,
  userId,
}: {
  accessToken: string;
  method: "POST" | "DELETE";
  role: ManagedUserRole;
  userId: number | string;
}) {
  return requestJson<ManagedRoleChangeResponse>(
    `${AUTH_BASE_URL}/roles/assign`,
    {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId, role }),
    },
    method === "POST"
      ? "No se pudo asignar el rol."
      : "No se pudo quitar el rol."
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
