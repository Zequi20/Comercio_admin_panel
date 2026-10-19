import { NextResponse } from "next/server";

import { getAdminApiContext } from "@/app/lib/api/admin";
import { serviceErrorResponse } from "@/app/lib/api/responses";
import {
  listAccountDeletionRequests,
  type AccountDeletionRequestStatus,
} from "@/app/lib/services/auth-service";

const STATUSES: AccountDeletionRequestStatus[] = [
  "PENDING",
  "COMPLETED",
  "REJECTED",
];

export async function GET(request: Request) {
  const admin = await getAdminApiContext();
  if (!admin.ok) return admin.response;

  const requestedStatus = new URL(request.url).searchParams
    .get("status")
    ?.toUpperCase();
  const status = STATUSES.find((item) => item === requestedStatus) ?? "PENDING";

  try {
    return NextResponse.json(
      await listAccountDeletionRequests({
        accessToken: admin.context.accessToken,
        status,
      })
    );
  } catch (error) {
    return serviceErrorResponse(
      error,
      "No se pudieron cargar las solicitudes de baja."
    );
  }
}
