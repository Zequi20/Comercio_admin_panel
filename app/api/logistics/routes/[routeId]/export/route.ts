import { NextResponse } from "next/server";

import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import { logisticsJson } from "@/app/lib/logistics/logistics-api";
import type {
  LogisticsContract,
  LogisticsRoute,
  RouteSettlement,
} from "@/app/lib/logistics/types";
import {
  buildSettlementCsv,
  buildSettlementWorkbook,
  XLSX_MIME,
} from "@/app/lib/logistics/workbook";

type RouteContext = { params: Promise<{ routeId: string }> };

/** Settlement of a closed route as .xlsx (three sheets) or .csv, for the carrier. */
export async function GET(request: Request, context: RouteContext) {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const { routeId } = await context.params;
  if (!/^\d+$/.test(routeId)) {
    return NextResponse.json({ message: "Recorrido inválido." }, { status: 400 });
  }
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  try {
    const [route, settlement, contract] = await Promise.all([
      logisticsJson<LogisticsRoute>({ path: `routes/${routeId}`, accessToken: admin.accessToken }),
      logisticsJson<RouteSettlement>({
        path: `routes/${routeId}/settlement`,
        accessToken: admin.accessToken,
      }),
      logisticsJson<LogisticsContract>({ path: "contract", accessToken: admin.accessToken }),
    ]);
    const labels = new Map(contract.failureReasons.map((reason) => [reason.code, reason.label]));
    const reasonLabel = (code: string | null) => (code ? labels.get(code) ?? code : "");
    const baseName = `rendicion-${route.carrier.code.toLowerCase()}-planilla-${route.import.sheetNumber}-recorrido-${route.id}`;

    if (format === "csv") {
      return new Response(buildSettlementCsv(settlement, reasonLabel), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseName}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const file = await buildSettlementWorkbook(route, settlement, reasonLabel);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo exportar la rendición." },
      { status: 502 }
    );
  }
}
