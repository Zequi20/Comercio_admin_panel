import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { requireLogisticsAdmin } from "@/app/lib/logistics/admin-context";
import { logisticsRequest } from "@/app/lib/logistics/logistics-api";
import {
  MAX_SHEET_FILE_BYTES,
  readSheetFile,
  sheetFileKind,
  SOURCE_FORMAT,
} from "@/app/lib/logistics/read-upload";

/**
 * Reads the uploaded sheet here (Y4pido template or the carrier's PDF) and sends rows to
 * orders-svc, which validates and stores a draft. Only the file hash is kept, never the file.
 */
export async function POST(request: Request) {
  const admin = await requireLogisticsAdmin();
  if (!admin.ok) return admin.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const carrierId = Number(form?.get("carrierId"));
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "Seleccioná la planilla a importar." }, { status: 400 });
  }
  if (file.size > MAX_SHEET_FILE_BYTES) {
    return NextResponse.json({ message: "La planilla supera 5 MB." }, { status: 400 });
  }
  if (!Number.isInteger(carrierId) || carrierId <= 0) {
    return NextResponse.json({ message: "Elegí la empresa de logística." }, { status: 400 });
  }
  const kind = sheetFileKind(file);
  if (!kind) {
    return NextResponse.json(
      { message: "Subí la planilla en PDF (Fixy) o en la plantilla del sistema (.xlsx o .csv)." },
      { status: 400 }
    );
  }

  const buffer = await file.arrayBuffer();
  let parsed;
  try {
    parsed = await readSheetFile(buffer, kind);
  } catch {
    return NextResponse.json({ message: "No se pudo leer el archivo." }, { status: 400 });
  }
  if (!parsed.sheetNumber || parsed.rows.length === 0) {
    return NextResponse.json(
      {
        message: parsed.problems[0] ?? "La planilla no tiene filas para importar.",
        problems: parsed.problems,
      },
      { status: 400 }
    );
  }

  const result = await logisticsRequest({
    path: "imports",
    method: "POST",
    accessToken: admin.accessToken,
    idempotencyKey: request.headers.get("Idempotency-Key"),
    body: {
      carrierId,
      sheetNumber: parsed.sheetNumber,
      sheetDate: parsed.sheetDate,
      sourceFormat: SOURCE_FORMAT[kind],
      fileSha256: createHash("sha256").update(Buffer.from(buffer)).digest("hex"),
      declaredTotals: parsed.declaredTotals,
      rows: parsed.rows,
    },
  });
  const body =
    result.body && typeof result.body === "object" && !Array.isArray(result.body)
      ? { ...(result.body as Record<string, unknown>), readerProblems: parsed.problems }
      : result.body;
  return NextResponse.json(body, { status: result.status });
}
