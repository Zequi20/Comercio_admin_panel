import "server-only";

import { readPdfRouteSheet } from "./pdf-sheet-reader";
import { extractPdfTextItems } from "./pdf-text";
import { readLogisticsSheet, type ParsedSheet } from "./sheet-reader";
import { loadSheetMatrix } from "./workbook";

export const MAX_SHEET_FILE_BYTES = 5 * 1024 * 1024;

export type SheetFileKind = "xlsx" | "csv" | "pdf";

export const SOURCE_FORMAT: Record<SheetFileKind, "XLSX" | "CSV" | "PDF"> = {
  xlsx: "XLSX",
  csv: "CSV",
  pdf: "PDF",
};

export function sheetFileKind(file: File): SheetFileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".pdf")) return "pdf";
  return null;
}

/** Reads the Y4pido template (.xlsx/.csv) or the carrier's route sheet PDF into rows. */
export async function readSheetFile(
  buffer: ArrayBuffer,
  kind: SheetFileKind
): Promise<ParsedSheet> {
  if (kind === "pdf") {
    return readPdfRouteSheet(await extractPdfTextItems(buffer));
  }
  return readLogisticsSheet(await loadSheetMatrix(buffer, kind));
}
