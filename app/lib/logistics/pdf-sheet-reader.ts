/**
 * Reads the route sheet PDF that Fixy prints ("PLANILLA DE RECORRIDO") from its positioned text.
 * Pure function over text items, so it can be tested without a PDF; pdf-text.ts extracts them.
 *
 * How it works:
 * - The detail table header (O, GUIA, ... DESTINATARIO, DIRECCION, LOCALIDAD, COBRAR, OBS) gives
 *   the columns. Titles are centered in their cells and cells share borders, so each border is
 *   2 × title center − previous border, starting at the table's left edge.
 * - Every guide number in the GUIA column starts a row. Cells are vertically centered, so each
 *   line of text belongs to the row whose guide number is closest vertically.
 * - Words are placed in columns by where they start; lines of one cell are joined in reading
 *   order. Split remitos ("TVF0E60F-" / "695") are glued back together.
 * - The sheet number (*16523*), date and printed totals are read so the totals can be compared.
 */

import type { DeclaredTotals, ImportRowPayload, ParsedSheet } from "./sheet-reader";

export type PdfTextItem = {
  page: number;
  /** Left edge, PDF units (origin bottom-left). */
  x: number;
  /** Baseline, PDF units (grows upwards). */
  y: number;
  width: number;
  str: string;
};

type Word = { page: number; x: number; end: number; y: number; text: string };

type ColumnField = keyof Omit<ImportRowPayload, "rowNumber"> | "ignored";

const HEADER_COLUMNS: { title: string; field: ColumnField }[] = [
  { title: "O", field: "sourceOrder" },
  { title: "GUIA", field: "trackingNumber" },
  { title: "G.AGENTE", field: "ignored" },
  { title: "SERVICIO", field: "serviceName" },
  { title: "ZONA", field: "ignored" },
  { title: "PESO", field: "weight" },
  { title: "REMITO", field: "remito" },
  { title: "BULTOS", field: "packages" },
  { title: "CLIENTE", field: "senderName" },
  { title: "DESTINATARIO", field: "recipientName" },
  { title: "DIRECCION", field: "address" },
  { title: "LOCALIDAD", field: "locality" },
  { title: "COBRAR", field: "amountToCollect" },
  { title: "OBS", field: "notes" },
];

/** A word may start this much left of its column border (rounding of centered titles). */
const COLUMN_TOLERANCE = 6;
/** Lines farther than this from every guide number are not table content (footers, totals). */
const MAX_ROW_DISTANCE = 26;
const SAME_LINE = 3;
const TRACKING_PATTERN = /^\d{4,12}$/;
const IGNORED_LINE = /^(pagina \d+ de \d+|t\. (cobrar|importe|bultos|guias|paradas|peso|recupero):?)/i;

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

/** Splits a text item into words with their approximate start, so merged cells can be told apart. */
const toWords = (item: PdfTextItem): Word[] => {
  const text = item.str;
  const length = text.length;
  if (!text.trim()) return [];
  const words: Word[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const share = (chars: number) => (length > 0 ? (item.width * chars) / length : 0);
    words.push({
      page: item.page,
      x: item.x + share(match.index),
      end: item.x + share(match.index + match[0].length),
      y: item.y,
      text: match[0],
    });
  }
  return words;
};

/** Widths of texts printed on their own, and per-character fallbacks, for one page. */
type TextMetrics = { exact: Map<string, number>; upper: number; other: number };

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

const pageMetrics = (items: PdfTextItem[]): TextMetrics => {
  const exact = new Map<string, number>();
  const upper: number[] = [];
  const other: number[] = [];
  for (const item of items) {
    const text = item.str.trim();
    if (text.length < 3) continue;
    if (!exact.has(text)) exact.set(text, item.width);
    const perChar = item.width / item.str.length;
    if (/^[^a-záéíóúñ]+$/.test(text) && /[A-Z]/.test(text)) upper.push(perChar);
    else if (/[a-z]/.test(text)) other.push(perChar);
  }
  const fallback = median([...upper, ...other]);
  return { exact, upper: median(upper) || fallback, other: median(other) || fallback };
};

const estimateWidth = (text: string, metrics: TextMetrics): number => {
  const known = metrics.exact.get(text);
  if (known !== undefined) return known;
  let width = 0;
  for (const char of text) {
    width += /[A-ZÁÉÍÓÚÑ0-9]/.test(char) ? metrics.upper : metrics.other;
  }
  return width;
};

/**
 * pdfjs sometimes merges two neighbouring cells of one line into a single item ("... 0 - (501)
 * CORONEL OVIEDO"); the blank space between the cells is not in the text, so proportional
 * positions drift. When an item crosses a column border, it is cut where the second part best
 * fills the space from that border to the item end, and each part is laid out in its own column.
 */
const toCellWords = (item: PdfTextItem, borders: number[], metrics: TextMetrics): Word[] => {
  const end = item.x + item.width;
  const crossing = borders.filter(
    (border) => border > item.x + COLUMN_TOLERANCE && border < end - COLUMN_TOLERANCE
  );
  const matches = [...item.str.matchAll(/\S+/g)];
  if (crossing.length === 0 || matches.length < 2) return toWords(item);

  let best: { split: number; border: number; error: number } | null = null;
  for (const border of crossing) {
    for (let split = 1; split < matches.length; split += 1) {
      const tail = item.str.slice(matches[split]!.index).trim();
      const error = Math.abs(end - border - estimateWidth(tail, metrics));
      if (!best || error < best.error) best = { split, border, error };
    }
  }
  if (!best) return toWords(item);

  const cut = matches[best.split]!.index;
  const leadItem = {
    ...item,
    str: item.str.slice(0, cut).trimEnd(),
    width: Math.max(1, best.border - 1 - item.x),
  };
  const tailItem = {
    ...item,
    str: item.str.slice(cut),
    x: best.border + 1,
    width: Math.max(1, end - best.border - 1),
  };
  // Either part may still span more than one cell.
  return [...toCellWords(leadItem, borders, metrics), ...toCellWords(tailItem, borders, metrics)];
};

const groupLines = (words: Word[]): Word[][] => {
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Word[][] = [];
  for (const word of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0]!.y - word.y) <= SAME_LINE) line.push(word);
    else lines.push([word]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
};

const lineText = (line: Word[]): string => line.map((word) => word.text).join(" ");

type HeaderLayout = { y: number; centers: number[] };

/** Finds the detail header on a page and derives the column borders from the title centers. */
const findHeader = (words: Word[]): HeaderLayout | null => {
  for (const line of groupLines(words)) {
    const titles = line.map((word) => fold(word.text));
    if (!["GUIA", "DESTINATARIO", "DIRECCION", "COBRAR"].every((title) => titles.includes(title))) {
      continue;
    }
    const centers: number[] = [];
    let cursor = 0;
    for (const column of HEADER_COLUMNS) {
      const index = titles.indexOf(column.title, cursor);
      if (index < 0) return null;
      const word = line[index]!;
      centers.push((word.x + word.end) / 2);
      cursor = index + 1;
    }
    return { y: line[0]!.y, centers };
  }
  return null;
};

const bordersFrom = (centers: number[], tableLeft: number): number[] => {
  const borders = [tableLeft];
  for (const center of centers) borders.push(2 * center - borders[borders.length - 1]!);
  return borders;
};

const columnOf = (x: number, borders: number[]): number => {
  let column = -1;
  for (let index = 0; index < HEADER_COLUMNS.length; index += 1) {
    if (x + COLUMN_TOLERANCE >= borders[index]!) column = index;
  }
  return column;
};

const joinCell = (field: ColumnField, lines: string[]): string => {
  if (field === "remito" || field === "trackingNumber") {
    // "TVF0E60F-" + "695", "EP-" + "005660-" + "153307".
    return lines.reduce((text, line) => (text && !text.endsWith("-") ? `${text} ${line}` : text + line), "");
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
};

const parseDeclared = (text: string): number | null => {
  const normalized = text.replace(/\./g, "").replace(/,(\d{1,2})$/, ".$1");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : null;
};

const readHeaderInfo = (
  items: PdfTextItem[]
): { sheetNumber: string | null; sheetDate: string | null; totals: DeclaredTotals | null } => {
  const pages = new Map<number, Word[]>();
  for (const item of items) {
    const words = toWords(item);
    pages.set(item.page, [...(pages.get(item.page) ?? []), ...words]);
  }
  const text = [...pages.keys()]
    .sort((a, b) => a - b)
    .map((page) => groupLines(pages.get(page) ?? []).map(lineText).join("\n"))
    .join("\n");

  const sheetNumber = /\*(\d{3,12})\*/.exec(text)?.[1] ?? null;
  const date = /FECHA:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(text);
  const sheetDate = date
    ? `${date[3]}-${date[2]!.padStart(2, "0")}-${date[1]!.padStart(2, "0")}`
    : null;

  const pick = (pattern: RegExp): number | null => {
    const match = pattern.exec(text);
    return match ? parseDeclared(match[1]!) : null;
  };
  const totals: DeclaredTotals = {
    amount: pick(/T\.\s*(?:Importe|cobrar):\s*\$?\s*([\d.,]+)/i),
    shipments: pick(/T\.\s*Gu[ií]as:\s*(\d+)/i),
    packages: pick(/T\.\s*Bultos:\s*(\d+)/i),
    stops: pick(/T\.\s*Paradas:\s*(\d+)/i),
  };
  const hasTotals = Object.values(totals).some((value) => value !== null);
  return { sheetNumber, sheetDate, totals: hasTotals ? totals : null };
};

export const readPdfRouteSheet = (items: PdfTextItem[]): ParsedSheet => {
  const problems: string[] = [];
  const { sheetNumber, sheetDate, totals } = readHeaderInfo(items);
  const rows: ImportRowPayload[] = [];
  const pages = [...new Set(items.map((item) => item.page))].sort((a, b) => a - b);
  let tablesFound = 0;

  for (const page of pages) {
    const pageItems = items.filter((item) => item.page === page);
    const header = findHeader(pageItems.flatMap(toWords));
    if (!header) continue;
    tablesFound += 1;

    const bodyItems = pageItems.filter(
      (item) =>
        item.y < header.y - SAME_LINE && item.str.trim() !== "" && !IGNORED_LINE.test(item.str.trim())
    );
    if (bodyItems.length === 0) continue;
    const tableLeft = Math.min(...bodyItems.map((item) => item.x)) - 3;
    const borders = bordersFrom(header.centers, tableLeft);
    const metrics = pageMetrics(bodyItems);
    const lines = groupLines(
      bodyItems.flatMap((item) => toCellWords(item, borders, metrics))
    ).filter((line) => !IGNORED_LINE.test(lineText(line)));
    const contentWords = lines.flat();
    const guideColumn = HEADER_COLUMNS.findIndex((column) => column.field === "trackingNumber");

    const anchors = contentWords
      .filter((word) => columnOf(word.x, borders) === guideColumn && TRACKING_PATTERN.test(word.text))
      .sort((a, b) => b.y - a.y);
    if (anchors.length === 0) continue;

    const cells = anchors.map(() => new Map<number, Word[]>());
    for (const word of contentWords) {
      let nearest = -1;
      let distance = Infinity;
      anchors.forEach((anchor, index) => {
        const gap = Math.abs(anchor.y - word.y);
        if (gap < distance) {
          distance = gap;
          nearest = index;
        }
      });
      if (nearest < 0 || distance > MAX_ROW_DISTANCE) continue;
      const column = columnOf(word.x, borders);
      if (column < 0) continue;
      const cell = cells[nearest]!;
      cell.set(column, [...(cell.get(column) ?? []), word]);
    }

    cells.forEach((cell) => {
      const row: ImportRowPayload = { rowNumber: rows.length + 1 };
      HEADER_COLUMNS.forEach((column, index) => {
        if (column.field === "ignored") return;
        const cellWords = cell.get(index);
        if (!cellWords) return;
        const text = joinCell(column.field, groupLines(cellWords).map(lineText));
        if (text) row[column.field] = text;
      });
      if (typeof row.amountToCollect === "string") {
        row.amountToCollect = row.amountToCollect.replace(/^\$\s*/, "");
      }
      rows.push(row);
    });
  }

  if (tablesFound === 0) {
    problems.push(
      "No se reconoció la tabla de la planilla de recorrido (columnas GUIA, DESTINATARIO, DIRECCION, COBRAR)."
    );
  }
  if (!sheetNumber) problems.push("No se encontró el número de planilla (*NNNNN*).");
  if (totals?.shipments != null && totals.shipments !== rows.length) {
    problems.push(
      `Se leyeron ${rows.length} guías y la planilla declara ${totals.shipments}. Revisá antes de confirmar.`
    );
  }

  return { sheetNumber, sheetDate, declaredTotals: totals, rows, problems };
};
