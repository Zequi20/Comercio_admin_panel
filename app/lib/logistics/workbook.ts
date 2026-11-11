import "server-only";

import ExcelJS from "exceljs";

import {
  parseCsv,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADER_LABELS,
  type SheetCellValue,
} from "./sheet-reader";
import type { LogisticsRoute, RouteSettlement } from "./types";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const cellValue = (value: ExcelJS.CellValue): SheetCellValue => {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value) return String(value.text);
    if ("error" in value) return null;
  }
  return String(value);
};

/** First worksheet of an .xlsx, or the whole .csv, as a matrix of cells. */
export async function loadSheetMatrix(
  file: ArrayBuffer,
  kind: "xlsx" | "csv"
): Promise<SheetCellValue[][]> {
  if (kind === "csv") {
    return parseCsv(new TextDecoder("utf-8").decode(file));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const matrix: SheetCellValue[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: SheetCellValue[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      values.push(cellValue(row.getCell(column).value));
    }
    matrix[rowNumber - 1] = values;
  });
  return Array.from(matrix, (row) => row ?? []);
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Planilla");
  sheet.addRow([TEMPLATE_HEADER_LABELS.sheetNumber, "16523"]);
  sheet.addRow([TEMPLATE_HEADER_LABELS.sheetDate, "2026-10-29"]);
  sheet.addRow([TEMPLATE_HEADER_LABELS.amount, 180000]);
  sheet.addRow([TEMPLATE_HEADER_LABELS.shipments, 1]);
  sheet.addRow([TEMPLATE_HEADER_LABELS.packages, 1]);
  sheet.addRow([TEMPLATE_HEADER_LABELS.stops, 1]);
  sheet.addRow([]);
  const header = sheet.addRow(TEMPLATE_COLUMNS.map((column) => column.header));
  header.font = { bold: true };
  sheet.addRow(TEMPLATE_COLUMNS.map((column) => column.example));
  sheet.columns.forEach((column, index) => {
    column.width = index === 6 ? 60 : 16;
  });
  for (let row = 1; row <= 6; row += 1) sheet.getCell(row, 1).font = { bold: true };

  const guide = workbook.addWorksheet("Guía");
  guide.addRow(["Columna", "Obligatoria", "Qué cargar", "Ejemplo"]).font = { bold: true };
  for (const column of TEMPLATE_COLUMNS) {
    guide.addRow([column.header, column.required ? "Sí" : "No", column.help, column.example]);
  }
  guide.addRow([]);
  guide.addRow([
    "Encabezado",
    "",
    "Las filas Planilla, Fecha y Totales se comparan con lo leído antes de confirmar.",
    "",
  ]);
  guide.columns = [{ width: 18 }, { width: 12 }, { width: 80 }, { width: 50 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const REASON_FALLBACK = "Sin motivo";

const money = (value: number | string) => Number(value);

export async function buildSettlementWorkbook(
  route: LogisticsRoute,
  settlement: RouteSettlement,
  reasonLabel: (code: string | null) => string
): Promise<Buffer> {
  const snapshot = settlement.snapshot;
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumen");
  summary.addRows([
    ["Rendición del recorrido", route.id],
    ["Empresa", route.carrier.name],
    ["Planilla", route.import.sheetNumber],
    ["Fecha del recorrido", route.businessDate],
    ["Repartidor (id)", route.courierId],
    ["Cerrado", settlement.generatedAt],
    [],
    ["Importe esperado (entregadas)", money(settlement.expectedAmount)],
    ["Importe cobrado", money(settlement.collectedAmount)],
    ["Diferencia", money(settlement.differenceAmount)],
    ["Moneda", settlement.currency],
    [],
    ["Guías", snapshot.counts.shipments],
    ["Entregadas", snapshot.counts.delivered],
    ["A devolver", snapshot.counts.returnPending],
    ["Faltantes", snapshot.counts.missing],
    ["Entregadas con diferencia de cobro", snapshot.counts.deliveredWithCollectionDifference],
    ["Bultos entregados", snapshot.packages.delivered],
    ["Bultos a devolver", snapshot.packages.returnPending],
    ["Bultos faltantes", snapshot.packages.missing],
    [],
    ["Remitente", "Entregadas", "A devolver", "Faltantes", "Esperado", "Cobrado"],
    ...snapshot.bySender.map((sender) => [
      sender.senderName,
      sender.delivered,
      sender.returnPending,
      sender.missing,
      sender.expectedAmount,
      sender.collectedAmount,
    ]),
  ]);
  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 18;

  const delivered = workbook.addWorksheet("Entregadas");
  delivered.addRow(["Guía", "Remitente", "Remito", "Bultos", "A cobrar", "Cobrado", "Diferencia"]).font = { bold: true };
  for (const line of snapshot.delivered) {
    delivered.addRow([
      line.trackingNumber,
      line.senderName ?? "",
      line.remito ?? "",
      line.packages,
      line.amountToCollect,
      line.collected,
      line.difference,
    ]);
  }

  const returns = workbook.addWorksheet("A devolver y faltantes");
  returns.addRow(["Guía", "Remitente", "Remito", "Bultos", "A cobrar", "Situación", "Motivo"]).font = { bold: true };
  for (const line of snapshot.toReturn) {
    returns.addRow([
      line.trackingNumber,
      line.senderName ?? "",
      line.remito ?? "",
      line.packages,
      line.amountToCollect,
      "A devolver",
      line.reason ? reasonLabel(line.reason) : REASON_FALLBACK,
    ]);
  }
  for (const line of snapshot.missing) {
    returns.addRow([
      line.trackingNumber,
      line.senderName ?? "",
      line.remito ?? "",
      line.packages,
      line.amountToCollect,
      "Faltante (no recibido)",
      "",
    ]);
  }
  for (const sheet of [delivered, returns]) {
    sheet.columns.forEach((column) => {
      column.width = 18;
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildSettlementCsv(
  settlement: RouteSettlement,
  reasonLabel: (code: string | null) => string
): string {
  const { snapshot } = settlement;
  const lines = [
    ["situacion", "guia", "remitente", "remito", "bultos", "a_cobrar", "cobrado", "diferencia", "motivo"],
    ...snapshot.delivered.map((line) => [
      "entregada",
      line.trackingNumber,
      line.senderName,
      line.remito,
      line.packages,
      line.amountToCollect,
      line.collected,
      line.difference,
      "",
    ]),
    ...snapshot.toReturn.map((line) => [
      "a_devolver",
      line.trackingNumber,
      line.senderName,
      line.remito,
      line.packages,
      line.amountToCollect,
      0,
      "",
      line.reason ? reasonLabel(line.reason) : REASON_FALLBACK,
    ]),
    ...snapshot.missing.map((line) => [
      "faltante",
      line.trackingNumber,
      line.senderName,
      line.remito,
      line.packages,
      line.amountToCollect,
      0,
      "",
      "",
    ]),
  ];
  return `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
