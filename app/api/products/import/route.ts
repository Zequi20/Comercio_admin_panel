import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { importProductsForMerchant } from "@/app/lib/services/commerce-services";

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "size" in value &&
      typeof value.name === "string" &&
      typeof value.size === "number"
  );
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();

  return (
    name.endsWith(".xlsx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export async function POST(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return unauthorizedCommerceResponse();
  }

  const incomingFormData = await request.formData().catch(() => null);
  const file = incomingFormData?.get("file") ?? null;

  if (!isUploadedFile(file) || file.size <= 0) {
    return badRequestResponse("Seleccioná un archivo Excel para importar.");
  }

  if (!isExcelFile(file)) {
    return badRequestResponse("Subí una plantilla .xlsx válida.");
  }

  const formData = new FormData();
  formData.set("file", file, file.name || "productos.xlsx");

  try {
    const importResult = await importProductsForMerchant({
      accessToken: context.accessToken,
      formData,
    });

    return NextResponse.json(importResult);
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo importar el archivo.");
  }
}
