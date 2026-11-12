import { NextResponse } from "next/server";

import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import {
  MAX_SHEET_FILE_BYTES,
  readSheetFile,
  sheetFileKind,
} from "@/app/lib/logistics/read-upload";
import { buildTemplateCsv } from "@/app/lib/logistics/sheet-reader";

/**
 * Converts the carrier's route sheet PDF into a CSV with the Y4pido template columns, to keep or
 * review in a spreadsheet; it can be uploaded again as is. Nothing is stored.
 */
export async function POST(request: Request) {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "Seleccioná el PDF a convertir." }, { status: 400 });
  }
  if (file.size > MAX_SHEET_FILE_BYTES) {
    return NextResponse.json({ message: "El archivo supera 5 MB." }, { status: 400 });
  }
  if (sheetFileKind(file) !== "pdf") {
    return NextResponse.json({ message: "Solo se convierten planillas en PDF." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await readSheetFile(await file.arrayBuffer(), "pdf");
  } catch {
    return NextResponse.json({ message: "No se pudo leer el PDF." }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { message: parsed.problems[0] ?? "El PDF no tiene filas.", problems: parsed.problems },
      { status: 400 }
    );
  }

  const name = `planilla-${parsed.sheetNumber ?? "sin-numero"}.csv`;
  return new Response(buildTemplateCsv(parsed), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Sheet-Rows": String(parsed.rows.length),
    },
  });
}
