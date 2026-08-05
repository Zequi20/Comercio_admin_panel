import { NextResponse } from "next/server";

import { parseManualNotificationPayload } from "@/app/lib/api/notifications";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { sendManualNotifications } from "@/app/lib/services/commerce-services";

export async function POST(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const permissions = context.session.user.permissions;
  if (permissions.length && !permissions.includes("notifications:send")) {
    return NextResponse.json(
      { message: "Tu cuenta no tiene permiso para enviar notificaciones." },
      { status: 403 }
    );
  }

  const parsed = parseManualNotificationPayload(
    await request.json().catch(() => null)
  );

  if (!parsed.ok) {
    return badRequestResponse(parsed.message);
  }

  try {
    const result = await sendManualNotifications({
      accessToken: context.accessToken,
      ...parsed.payload,
      data: {
        ...(parsed.payload.data ?? {}),
        source: "merchant_manual",
        ...(context.session.merchant?.id
          ? { merchantId: String(context.session.merchant.id) }
          : {}),
      },
    });

    return NextResponse.json(result, {
      status: result.status === "failed" ? 502 : 202,
    });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo enviar la notificación.");
  }
}
