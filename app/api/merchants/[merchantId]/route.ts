import { NextResponse } from "next/server";

import { merchantPayloadFromClient } from "@/app/lib/api/merchants";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import { updateMerchantDetails } from "@/app/lib/services/auth-service";

type MerchantRouteContext = {
  params: Promise<{ merchantId: string }>;
};

export async function PATCH(request: Request, context: MerchantRouteContext) {
  const sessionContext = await getScopedCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { merchantId } = await context.params;

  if (
    sessionContext.scope.mode !== "merchant" ||
    String(merchantId) !== String(sessionContext.scope.merchantId)
  ) {
    return NextResponse.json(
      { message: "Seleccioná el comercio antes de modificarlo." },
      { status: 403 }
    );
  }

  const payload = merchantPayloadFromClient(
    await request.json().catch(() => null)
  );

  if (!payload) {
    return badRequestResponse("Enviá isOpen o metadata con un formato válido.");
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
