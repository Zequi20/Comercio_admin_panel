import "server-only";

import ExcelJS from "exceljs";

import {
  parseCsv,
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADER_LABELS,
  type SheetCellValue,
} from "./sheet-reader";
import { describeMoneyDifference, formatDate, formatDateTime } from "./client";
import { readXlsMatrix } from "./xls-reader";
import type { ImportSettlement, LogisticsRoute, RouteSettlement, SettlementSnapshot } from "./types";

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

/** First worksheet of an .xlsx or a legacy .xls, or the whole .csv, as a matrix of cells. */
export async function loadSheetMatrix(
  file: ArrayBuffer,
  kind: "xlsx" | "xls" | "csv"
): Promise<SheetCellValue[][]> {
  if (kind === "csv") {
    return parseCsv(new TextDecoder("utf-8").decode(file));
  }
  if (kind === "xls") {
    return readXlsMatrix(file);
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
    ["Planilla", route.import.sheetNumber],
    ["Empresa de logística", route.carrier.name],
    ["Recorrido", route.id],
    ["Fecha del recorrido", formatDate(route.businessDate)],
    ["Repartidor (id)", route.courierId],
    ["Cerrado el", formatDateTime(settlement.generatedAt)],
    [],
    ["A cobrar por lo entregado", money(settlement.expectedAmount)],
    ["Cobrado", money(settlement.collectedAmount)],
    ["Diferencia (cobrado − a cobrar)", money(settlement.differenceAmount)],
    ["Situación", describeMoneyDifference(money(settlement.differenceAmount))],
    ["Moneda", settlement.currency],
    [],
    ["Guías", snapshot.counts.shipments],
    ["Entregadas", snapshot.counts.delivered],
    ["Para devolver", snapshot.counts.returnPending],
    ["No recibidas", snapshot.counts.missing],
    ["Entregadas y cobradas por otro monto", snapshot.counts.deliveredWithCollectionDifference],
    ["Bultos entregados", snapshot.packages.delivered],
    ["Bultos para devolver", snapshot.packages.returnPending],
    ["Bultos no recibidos", snapshot.packages.missing],
    [],
    ...senderRows(snapshot),
  ]);
  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 18;

  addLineSheets(workbook, snapshot, reasonLabel);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The delivered guides, and what goes back to the carrier, one sheet each. */
function addLineSheets(
  workbook: ExcelJS.Workbook,
  snapshot: SettlementSnapshot,
  reasonLabel: (code: string | null) => string
): void {
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

  const returns = workbook.addWorksheet("Para devolver y no recibidas");
  returns.addRow(["Guía", "Remitente", "Remito", "Bultos", "A cobrar", "Situación", "Motivo"]).font = { bold: true };
  for (const line of snapshot.toReturn) {
    returns.addRow([
      line.trackingNumber,
      line.senderName ?? "",
      line.remito ?? "",
      line.packages,
      line.amountToCollect,
      "Para devolver",
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
      "No recibida",
      "",
    ]);
  }
  for (const sheet of [delivered, returns]) {
    sheet.columns.forEach((column) => {
      column.width = 18;
    });
  }
}

/** Sender breakdown rows, shared by the route and the sheet settlement. */
const senderRows = (snapshot: SettlementSnapshot) => [
  ["Remitente", "Entregadas", "Para devolver", "No recibidas", "A cobrar por lo entregado", "Cobrado"],
  ...snapshot.bySender.map((sender) => [
    sender.senderName,
    sender.delivered,
    sender.returnPending,
    sender.missing,
    sender.expectedAmount,
    sender.collectedAmount,
  ]),
];

/**
 * Settlement of a whole sheet split among couriers: one line per courier and the total the carrier
 * settles, plus every delivered and returned guide. Open routes count with their live figures.
 */
export async function buildSheetSettlementWorkbook(
  sheet: ImportSettlement,
  courierName: (courierId: number) => string,
  reasonLabel: (code: string | null) => string
): Promise<Buffer> {
  const { snapshot } = sheet;
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("Resumen");
  summary.addRows([
    ["Planilla", sheet.sheetNumber],
    ["Empresa de logística", sheet.carrierName],
    ["Fecha de la planilla", formatDate(sheet.sheetDate)],
    ["Estado", sheet.closed ? "Rendición final: todos los recorridos cerrados" : "Provisoria: hay recorridos abiertos"],
    [],
    ["Repartidor", "Recorrido", "Estado", "Guías", "Entregadas", "A cobrar por lo entregado", "Cobrado", "Situación"],
    ...sheet.routes.map((part) => [
      courierName(part.courierId),
      part.routeId,
      part.final ? "Cerrado" : "Abierto",
      part.counts.shipments,
      part.counts.delivered,
      part.expectedAmount,
      part.collectedAmount,
      describeMoneyDifference(part.differenceAmount),
    ]),
    [],
    ["A cobrar por lo entregado", money(snapshot.expectedAmount)],
    ["Cobrado", money(snapshot.collectedAmount)],
    ["Diferencia (cobrado − a cobrar)", money(snapshot.differenceAmount)],
    ["Situación", describeMoneyDifference(money(snapshot.differenceAmount))],
    ["Moneda", sheet.currency],
    [],
    ["Guías", snapshot.counts.shipments],
    ["Entregadas", snapshot.counts.delivered],
    ["Para devolver", snapshot.counts.returnPending],
    ["No recibidas", snapshot.counts.missing],
    ["Entregadas y cobradas por otro monto", snapshot.counts.deliveredWithCollectionDifference],
    ["Bultos entregados", snapshot.packages.delivered],
    ["Bultos para devolver", snapshot.packages.returnPending],
    ["Bultos no recibidos", snapshot.packages.missing],
    [],
    ...senderRows(snapshot),
  ]);
  summary.getColumn(1).width = 36;
  for (const index of [2, 3, 4, 5, 6, 7, 8]) summary.getColumn(index).width = 18;
  addLineSheets(workbook, snapshot, reasonLabel);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildSettlementCsv(
  settlement: { snapshot: SettlementSnapshot },
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
      "para_devolver",
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
      "no_recibida",
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
