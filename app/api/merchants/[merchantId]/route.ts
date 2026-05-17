import { NextResponse } from "next/server";

import { merchantPayloadFromClient } from "@/app/lib/api/merchants";
import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { updateMerchantDetails } from "@/app/lib/services/auth-service";

type MerchantRouteContext = {
  params: Promise<{ merchantId: string }>;
};

export async function PATCH(request: Request, context: MerchantRouteContext) {
  const sessionContext = await getCommerceRequestContextFromCookies();

  if (!sessionContext) {
    return unauthorizedCommerceResponse();
  }

  const { merchantId } = await context.params;

  if (String(merchantId) !== String(sessionContext.session.merchant.id)) {
    return NextResponse.json(
      { message: "No podés modificar otro comercio." },
      { status: 403 }
    );
  }

  const payload = merchantPayloadFromClient(
    await request.json().catch(() => null)
  );

  if (!payload) {
    return badRequestResponse("Enviá isOpen como true o false.");
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
