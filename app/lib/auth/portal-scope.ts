import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { fetchMerchantDetails } from "../services/auth-service";
import { getCommerceRequestContextFromCookies } from "./session";
import type { CommerceSession, PortalScope } from "./types";

const adminScopeCookieName = "admin_merchant_scope";
const globalScopeValue = "all";

export function isAdminSession(session: CommerceSession) {
  return session.user.roles.includes("ADMIN");
}

function merchantScope(
  merchant: NonNullable<CommerceSession["merchant"]>
): PortalScope {
  return {
    mode: "merchant",
    merchantId: merchant.id,
    merchant,
  };
}

export async function resolvePortalScope({
  accessToken,
  session,
}: {
  accessToken: string;
  session: CommerceSession;
}): Promise<PortalScope> {
  if (!isAdminSession(session)) {
    if (!session.merchant) {
      throw new Error("La sesión del comercio no tiene un comercio asociado.");
    }

    return merchantScope(session.merchant);
  }

  const cookieStore = await cookies();
  const selectedScope = cookieStore.get(adminScopeCookieName)?.value;

  if (!selectedScope || selectedScope === globalScopeValue) {
    return { mode: "global", merchantId: null, merchant: null };
  }

  if (!/^\d+$/.test(selectedScope)) {
    return { mode: "global", merchantId: null, merchant: null };
  }

  try {
    const merchant = await fetchMerchantDetails(selectedScope, accessToken);
    return {
      mode: "merchant",
      merchantId: merchant.id,
      merchant,
    };
  } catch {
    return { mode: "global", merchantId: null, merchant: null };
  }
}

export async function getScopedCommerceRequestContextFromCookies() {
  const context = await getCommerceRequestContextFromCookies();
  if (!context) return null;

  const scope = await resolvePortalScope(context);
  return {
    ...context,
    isAdmin: isAdminSession(context.session),
    scope,
  };
}

export function setAdminScopeCookie(
  response: NextResponse,
  merchantId: number | string | null
) {
  response.cookies.set(
    adminScopeCookieName,
    merchantId === null ? globalScopeValue : String(merchantId),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    }
  );
}
