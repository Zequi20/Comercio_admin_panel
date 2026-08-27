import { NextResponse } from "next/server";

import { getAdminApiContext } from "@/app/lib/api/admin";
import {
  adminMerchantPayloadFromClient,
  merchantPayloadFromClient,
} from "@/app/lib/api/merchants";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  deleteMerchant,
  updateMerchantDetails,
} from "@/app/lib/services/auth-service";

type MerchantRouteContext = {
  params: Promise<{ merchantId: string }>;
};

function positiveMerchantId(value: unknown) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export async function PATCH(request: Request, context: MerchantRouteContext) {
  const sessionContext = await getScopedCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const merchantId = positiveMerchantId((await context.params).merchantId);
  if (!merchantId) {
    return badRequestResponse("El ID del comercio no es válido.");
  }
  const isAdmin = sessionContext.session.user.roles.includes("ADMIN");

  if (
    !isAdmin &&
    (sessionContext.scope.mode !== "merchant" ||
      String(merchantId) !== String(sessionContext.scope.merchantId))
  ) {
    return NextResponse.json(
      { message: "Seleccioná el comercio antes de modificarlo." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const adminPayload = isAdmin
    ? adminMerchantPayloadFromClient(body)
    : null;
  const payload = isAdmin
    ? adminPayload?.ok
      ? adminPayload.payload
      : null
    : merchantPayloadFromClient(body);

  if (!payload) {
    return badRequestResponse(
      isAdmin && adminPayload && !adminPayload.ok
        ? adminPayload.message
        : "Enviá isOpen, autoConfirmOrders o metadata con un formato válido."
    );
  }

  try {
    const merchant = await updateMerchantDetails({
      accessToken: sessionContext.accessToken,
      merchantId,
      payload,
    });

    return NextResponse.json(merchant);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo actualizar el comercio.");
  }
}

export async function DELETE(_request: Request, context: MerchantRouteContext) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const merchantId = positiveMerchantId((await context.params).merchantId);
  if (!merchantId) {
    return badRequestResponse("El ID del comercio no es válido.");
  }

  try {
    await deleteMerchant({
      accessToken: admin.context.accessToken,
      merchantId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo eliminar el comercio.");
  }
}
