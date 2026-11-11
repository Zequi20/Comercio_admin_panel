/**
 * Reads a carrier route sheet (Y4pido logistics template, as .xlsx or .csv) into the rows the
 * orders API expects. Pure functions over a matrix of cells: no I/O, so they can be tested. The API
 * validates every value again; this only finds the header, maps the columns and reads the totals.
 */

export type SheetCellValue = string | number | boolean | Date | null | undefined;

export type ImportRowPayload = {
  rowNumber: number;
  trackingNumber?: string | number | null;
  sourceOrder?: string | number | null;
  remito?: string | number | null;
  senderName?: string | number | null;
  serviceName?: string | number | null;
  recipientName?: string | number | null;
  recipientPhone?: string | number | null;
  address?: string | number | null;
  locality?: string | number | null;
  packages?: string | number | null;
  weight?: string | number | null;
  amountToCollect?: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  notes?: string | number | null;
};

export type DeclaredTotals = {
  amount?: number | null;
  shipments?: number | null;
  packages?: number | null;
  stops?: number | null;
};

export type ParsedSheet = {
  sheetNumber: string | null;
  sheetDate: string | null;
  declaredTotals: DeclaredTotals | null;
  rows: ImportRowPayload[];
  problems: string[];
};

type RowField = Exclude<keyof ImportRowPayload, "rowNumber">;

export const TEMPLATE_COLUMNS: {
  field: RowField;
  header: string;
  required: boolean;
  help: string;
  example: string;
}[] = [
  { field: "trackingNumber", header: "guia", required: true, help: "Número de guía de la empresa de logística.", example: "220863" },
  { field: "sourceOrder", header: "orden", required: false, help: "Orden de la planilla (puede repetirse).", example: "1" },
  { field: "remito", header: "remito", required: false, help: "Remito del remitente, si lo hay.", example: "TVF0E60F695" },
  { field: "senderName", header: "remitente", required: false, help: "Cliente de la empresa de logística (columna CLIENTE de Fixy).", example: "Dropi" },
  { field: "serviceName", header: "servicio", required: false, help: "Servicio contratado.", example: "Standard A" },
  { field: "recipientName", header: "destinatario", required: false, help: "Nombre de quien recibe.", example: "Nombre Apellido" },
  { field: "address", header: "direccion", required: true, help: "Dirección tal como viene; puede incluir plus code o Coordenadas: (...).", example: "GFFQ+VMF Coronel Oviedo - Calle sin nombre 0 - (501)" },
  { field: "locality", header: "localidad", required: false, help: "Localidad.", example: "CORONEL OVIEDO" },
  { field: "packages", header: "bultos", required: true, help: "Cantidad de bultos (entero mayor que 0).", example: "1" },
  { field: "weight", header: "peso", required: false, help: "Peso tal como viene (la planilla no indica unidad).", example: "1" },
  { field: "amountToCollect", header: "cobrar", required: true, help: "Importe a cobrar en guaraníes; 0 si no hay cobro.", example: "180000" },
  { field: "recipientPhone", header: "telefono", required: false, help: "Teléfono del destinatario, si lo hay.", example: "0981123456" },
  { field: "latitude", header: "latitud", required: false, help: "Latitud, si se conoce.", example: "-25.468357" },
  { field: "longitude", header: "longitud", required: false, help: "Longitud, si se conoce.", example: "-56.468470" },
  { field: "notes", header: "observaciones", required: false, help: "Observaciones de la entrega.", example: "Llamar antes" },
];

export const TEMPLATE_HEADER_LABELS = {
  sheetNumber: "Planilla",
  sheetDate: "Fecha",
  amount: "Total importe",
  shipments: "Total guías",
  packages: "Total bultos",
  stops: "Total paradas",
} as const;

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLUMN_ALIASES: Record<string, RowField> = {
  guia: "trackingNumber",
  "nro guia": "trackingNumber",
  "numero de guia": "trackingNumber",
  orden: "sourceOrder",
  o: "sourceOrder",
  remito: "remito",
  remitente: "senderName",
  cliente: "senderName",
  servicio: "serviceName",
  destinatario: "recipientName",
  direccion: "address",
  domicilio: "address",
  localidad: "locality",
  bultos: "packages",
  peso: "weight",
  cobrar: "amountToCollect",
  importe: "amountToCollect",
  monto: "amountToCollect",
  telefono: "recipientPhone",
  celular: "recipientPhone",
  latitud: "latitude",
  lat: "latitude",
  longitud: "longitude",
  lng: "longitude",
  lon: "longitude",
  observaciones: "notes",
  obs: "notes",
  notas: "notes",
};

const HEADER_ALIASES: Record<string, keyof typeof TEMPLATE_HEADER_LABELS> = {
  planilla: "sheetNumber",
  "planilla de recorrido": "sheetNumber",
  fecha: "sheetDate",
  "total importe": "amount",
  "t importe": "amount",
  "total cobrar": "amount",
  "t cobrar": "amount",
  "total guias": "shipments",
  "t guias": "shipments",
  "total bultos": "packages",
  "t bultos": "packages",
  "total paradas": "stops",
  "t paradas": "stops",
};

const cellText = (value: SheetCellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

const isEmptyRow = (row: SheetCellValue[]): boolean => row.every((cell) => cellText(cell) === "");

/** Reads "22.641.760,00", "$ 180.000" or 180000 as a whole number; null if it is not one. */
export const parseDeclaredNumber = (value: SheetCellValue): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  let text = cellText(value).replace(/\$|₲|\bgs\.?/gi, "").replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
};

/** Accepts a spreadsheet date, "29/10/2026" or "2026-10-29". */
export const parseSheetDate = (value: SheetCellValue): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (match) {
    return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  }
  return null;
};

const cellPayload = (value: SheetCellValue): string | number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value);
  return text ? text : null;
};

const findHeaderRow = (matrix: SheetCellValue[][]): number =>
  matrix.findIndex((row) => {
    const fields = new Set(row.map((cell) => COLUMN_ALIASES[fold(cellText(cell))]));
    return fields.has("trackingNumber") && fields.has("amountToCollect");
  });

export const readLogisticsSheet = (matrix: SheetCellValue[][]): ParsedSheet => {
  const problems: string[] = [];
  const headerIndex = findHeaderRow(matrix);
  if (headerIndex < 0) {
    return {
      sheetNumber: null,
      sheetDate: null,
      declaredTotals: null,
      rows: [],
      problems: [
        'No se encontró la fila de encabezados. Usá la plantilla de Y4pido: debe tener al menos las columnas "guia" y "cobrar".',
      ],
    };
  }

  let sheetNumber: string | null = null;
  let sheetDate: string | null = null;
  const totals: DeclaredTotals = {};
  for (const row of matrix.slice(0, headerIndex)) {
    const key = HEADER_ALIASES[fold(cellText(row[0]))];
    const value = row.slice(1).find((cell) => cellText(cell) !== "");
    if (!key || value === undefined) continue;
    if (key === "sheetNumber") sheetNumber = cellText(value).replace(/^\*|\*$/g, "");
    else if (key === "sheetDate") sheetDate = parseSheetDate(value);
    else totals[key] = parseDeclaredNumber(value);
  }

  const columns = (matrix[headerIndex] ?? []).map((cell) => COLUMN_ALIASES[fold(cellText(cell))]);
  const seen = new Set<RowField>();
  columns.forEach((field) => {
    if (!field) return;
    if (seen.has(field)) problems.push(`La columna "${field}" aparece más de una vez; se usa la primera.`);
    seen.add(field);
  });
  for (const column of TEMPLATE_COLUMNS) {
    if (column.required && !seen.has(column.field)) {
      problems.push(`Falta la columna obligatoria "${column.header}".`);
    }
  }

  const rows: ImportRowPayload[] = [];
  matrix.slice(headerIndex + 1).forEach((cells, offset) => {
    if (isEmptyRow(cells)) return;
    const row: ImportRowPayload = { rowNumber: headerIndex + offset + 2 };
    const assigned = new Set<RowField>();
    columns.forEach((field, index) => {
      if (!field || assigned.has(field)) return;
      assigned.add(field);
      const value = cellPayload(cells[index]);
      if (value !== null) row[field] = value;
    });
    rows.push(row);
  });

  if (!sheetNumber) problems.push('Falta el número de planilla (fila "Planilla").');
  const hasTotals = Object.values(totals).some((value) => value !== null && value !== undefined);

  return {
    sheetNumber,
    sheetDate,
    declaredTotals: hasTotals ? totals : null,
    rows,
    problems,
  };
};

/** Minimal CSV reader: quotes, escaped quotes, CRLF, and "," or ";" detected from the first line. */
export const parseCsv = (text: string): string[][] => {
  const content = text.replace(/^﻿/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};
