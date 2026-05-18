import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import {
  fetchAuthProfile,
  fetchMerchantDetails,
  refreshAuthSession,
} from "../services/auth-service";
import {
  decodeJwtPayload,
  resolveCommerceAccess,
} from "./access";
import type {
  AuthLoginResponse,
  AuthUser,
  CommerceSession,
  MerchantDetails,
} from "./types";

const accessCookieName = "access_token";
const refreshCookieName = "refresh_token";
const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
type CommerceSessionOptions = {
  includeMerchantDetails?: boolean;
};

function readAccessToken(payload: AuthLoginResponse) {
  return (
    payload.tokens?.accessToken ??
    payload.tokens?.access_token ??
    payload.tokens?.token ??
    payload.accessToken ??
    payload.access_token ??
    payload.token ??
    null
  );
}

function readRefreshToken(payload: AuthLoginResponse) {
  return (
    payload.tokens?.refreshToken ??
    payload.tokens?.refresh_token ??
    payload.refreshToken ??
    payload.refresh_token ??
    null
  );
}

function merchantName(
  merchant: MerchantDetails | null,
  fallback?: {
    id?: number | string;
    name?: string | null;
    email?: string | null;
    contactEmail?: string | null;
  } | null
) {
  return (
    merchant?.name ??
    fallback?.name ??
    fallback?.contactEmail ??
    fallback?.email ??
    `Comercio #${fallback?.id ?? merchant?.id ?? ""}`.trim()
  );
}

function toSession({
  user,
  access,
  merchant,
}: {
  user?: AuthUser | null;
  access: Extract<ReturnType<typeof resolveCommerceAccess>, { ok: true }>;
  merchant: MerchantDetails | null;
}): CommerceSession {
  const merchantFallback = access.merchant
    ? { ...access.merchant, id: access.merchantId }
    : { id: access.merchantId };

  return {
    user: {
      id: access.userId ?? user?.id,
      email: access.email ?? user?.email ?? "usuario@y4pido.local",
      nickname: access.nickname ?? user?.nickname,
      roles: access.roles,
      permissions: access.permissions,
    },
    merchant: {
      id: merchant?.id ?? access.merchantId,
      name: merchantName(merchant, merchantFallback),
      contactEmail:
        merchant?.contactEmail ??
        merchant?.email ??
        access.merchant?.contactEmail ??
        access.merchant?.email ??
        null,
      deliveryCost: merchant?.deliveryCost ?? null,
      isOpen: merchant?.isOpen ?? null,
      metadata: merchant?.metadata ?? null,
    },
  };
}

async function getMerchantSafely(
  merchantId: number | string,
  accessToken: string
) {
  try {
    return await fetchMerchantDetails(merchantId, accessToken);
  } catch {
    return null;
  }
}

export async function createCommerceSessionFromLogin(
  payload: AuthLoginResponse,
  options: CommerceSessionOptions = {}
): Promise<
  | {
      ok: true;
      session: CommerceSession;
      accessToken: string;
      refreshToken: string | null;
    }
  | { ok: false; reason: string }
> {
  const accessToken = readAccessToken(payload);

  if (!accessToken) {
    return {
      ok: false,
      reason: "El servicio de autenticación no devolvió un token válido.",
    };
  }

  let profile: AuthUser | null = null;
  try {
    profile = await fetchAuthProfile(accessToken);
  } catch {
    profile = payload.user ?? null;
  }

  const jwtPayload = decodeJwtPayload(accessToken);
  const access = resolveCommerceAccess({
    user: profile ?? payload.user,
    jwtPayload,
  });

  if (!access.ok) {
    return { ok: false, reason: access.reason };
  }

  const merchant = options.includeMerchantDetails
    ? await getMerchantSafely(access.merchantId, accessToken)
    : null;

  return {
    ok: true,
    session: toSession({
      user: profile ?? payload.user,
      access,
      merchant,
    }),
    accessToken,
    refreshToken: readRefreshToken(payload),
  };
}

async function refreshCommerceSessionFromToken(
  refreshToken: string,
  options: CommerceSessionOptions = {}
) {
  const authPayload = await refreshAuthSession(refreshToken);
  const refreshedSession = await createCommerceSessionFromLogin(
    authPayload,
    options
  );

  if (!refreshedSession.ok) {
    return refreshedSession;
  }

  return {
    ...refreshedSession,
    refreshToken: refreshedSession.refreshToken ?? refreshToken,
  };
}

export async function getCommerceSessionFromToken(
  accessToken: string,
  options: CommerceSessionOptions = {}
) {
  try {
    const profile = await fetchAuthProfile(accessToken);
    const access = resolveCommerceAccess({
      user: profile,
      jwtPayload: decodeJwtPayload(accessToken),
    });

    if (!access.ok) return null;

    const merchant = options.includeMerchantDetails
      ? await getMerchantSafely(access.merchantId, accessToken)
      : null;

    return toSession({ user: profile, access, merchant });
  } catch {
    return null;
  }
}

export async function getCommerceSessionFromCookies(
  options: CommerceSessionOptions = {}
) {
  const context = await getCommerceRequestContextFromCookies(options);
  return context?.session ?? null;
}

export async function getCommerceRequestContextFromCookies(
  options: CommerceSessionOptions = {}
) {
  const { accessToken, refreshToken } = await getAuthCookieValues();

  if (accessToken) {
    const session = await getCommerceSessionFromToken(accessToken, options);

    if (session) {
      return { accessToken, session };
    }
  }

  if (!refreshToken) return null;

  try {
    const refreshedSession = await refreshCommerceSessionFromToken(
      refreshToken,
      options
    );

    if (!refreshedSession.ok) {
      return null;
    }

    await persistAuthCookiesIfPossible({
      accessToken: refreshedSession.accessToken,
      refreshToken: refreshedSession.refreshToken,
    });

    return {
      accessToken: refreshedSession.accessToken,
      session: refreshedSession.session,
    };
  } catch {
    return null;
  }
}

export async function getAuthCookieValues() {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(accessCookieName)?.value ?? null,
    refreshToken: cookieStore.get(refreshCookieName)?.value ?? null,
  };
}

export function setAuthCookies(
  response: NextResponse,
  values: { accessToken: string; refreshToken?: string | null }
) {
  response.cookies.set(accessCookieName, values.accessToken, {
    ...authCookieOptions,
  });

  if (values.refreshToken) {
    response.cookies.set(refreshCookieName, values.refreshToken, {
      ...authCookieOptions,
    });
  }
}

async function persistAuthCookiesIfPossible(values: {
  accessToken: string;
  refreshToken?: string | null;
}) {
  try {
    const cookieStore = await cookies();

    cookieStore.set(accessCookieName, values.accessToken, {
      ...authCookieOptions,
    });

    if (values.refreshToken) {
      cookieStore.set(refreshCookieName, values.refreshToken, {
        ...authCookieOptions,
      });
    }
  } catch {
    // En Server Components las cookies son de solo lectura. La sesión renovada
    // se usa para la respuesta actual y el próximo API route persistirá cookies.
  }
}

export function clearAuthCookies(
  response: NextResponse
) {
  response.cookies.set(accessCookieName, "", {
    ...authCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(refreshCookieName, "", {
    ...authCookieOptions,
    maxAge: 0,
  });
}
