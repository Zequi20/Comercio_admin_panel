import { NextResponse } from "next/server";

import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import { logisticsJson } from "@/app/lib/logistics/logistics-api";
import type { ImportSettlement, LogisticsContract } from "@/app/lib/logistics/types";
import { buildSettlementCsv, buildSheetSettlementWorkbook, XLSX_MIME } from "@/app/lib/logistics/workbook";
import { listAllUniversalCouriers } from "@/app/lib/services/commerce-services";

type RouteContext = { params: Promise<{ importId: string }> };

type CourierRecord = { id: number | string; name?: string | null; user?: { email?: string | null; nickname?: string | null } | null };

/** Settlement of a whole sheet (every route it was split into) as .xlsx or .csv, for the carrier. */
export async function GET(request: Request, context: RouteContext) {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const { importId } = await context.params;
  if (!/^\d+$/.test(importId)) {
    return NextResponse.json({ message: "Planilla inválida." }, { status: 400 });
  }
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

  try {
    const [sheet, contract, couriers] = await Promise.all([
      logisticsJson<ImportSettlement>({ path: `imports/${importId}/settlement`, accessToken: admin.accessToken }),
      logisticsJson<LogisticsContract>({ path: "contract", accessToken: admin.accessToken }),
      listAllUniversalCouriers({ accessToken: admin.accessToken })
        .then((result) => (result.data ?? []) as CourierRecord[])
        .catch(() => [] as CourierRecord[]),
    ]);
    const labels = new Map(contract.failureReasons.map((reason) => [reason.code, reason.label]));
    const reasonLabel = (code: string | null) => (code ? labels.get(code) ?? code : "");
    const courierName = (courierId: number) => {
      const courier = couriers.find((candidate) => Number(candidate.id) === courierId);
      return courier?.name || courier?.user?.nickname || courier?.user?.email || `Repartidor #${courierId}`;
    };
    const baseName = `rendicion-planilla-${sheet.sheetNumber}${sheet.closed ? "" : "-provisoria"}`;

    if (format === "csv") {
      return new Response(buildSettlementCsv(sheet, reasonLabel), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseName}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const file = await buildSheetSettlementWorkbook(sheet, courierName, reasonLabel);
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
