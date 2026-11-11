import { NextResponse } from "next/server";

import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import { isAllowedLogisticsPath, logisticsRequest } from "@/app/lib/logistics/logistics-api";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext, method: "GET" | "POST" | "PATCH") {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const { path } = await context.params;
  const joined = path.join("/");
  if (!isAllowedLogisticsPath(joined)) {
    return NextResponse.json({ message: "Ruta de logística no disponible." }, { status: 404 });
  }

  const body = method === "GET" ? undefined : await request.json().catch(() => ({}));
  const result = await logisticsRequest({
    path: joined,
    method,
    accessToken: admin.accessToken,
    body,
    search: new URL(request.url).search,
    idempotencyKey: request.headers.get("Idempotency-Key"),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context, "PATCH");
}
