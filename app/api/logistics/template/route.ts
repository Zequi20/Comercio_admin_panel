import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import { buildTemplateWorkbook, XLSX_MIME } from "@/app/lib/logistics/workbook";

export async function GET() {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const file = await buildTemplateWorkbook();
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": 'attachment; filename="modelo-planilla-recorrido.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
