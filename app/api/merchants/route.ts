import { NextResponse } from "next/server";

import { getAdminApiContext } from "@/app/lib/api/admin";
import { adminMerchantPayloadFromClient } from "@/app/lib/api/merchants";
import {
  badRequestResponse,
  serviceErrorResponse,
} from "@/app/lib/api/responses";
import {
  createMerchant,
  listMerchantDirectory,
} from "@/app/lib/services/auth-service";

export async function GET() {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  try {
    const merchants = await listMerchantDirectory(admin.context.accessToken);
    return NextResponse.json({ data: merchants });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo cargar la lista de comercios.");
  }
}

export async function POST(request: Request) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const parsed = adminMerchantPayloadFromClient(
    await request.json().catch(() => null),
    { requireIdentity: true }
  );
  if (!parsed.ok) return badRequestResponse(parsed.message);

  try {
    const merchant = await createMerchant({
      accessToken: admin.context.accessToken,
      payload: parsed.payload,
    });
    return NextResponse.json(merchant, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el comercio.");
  }
}
