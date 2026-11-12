import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readPdfRouteSheet, type PdfTextItem } from "../../app/lib/logistics/pdf-sheet-reader";
import { buildTemplateCsv, parseCsv, readLogisticsSheet } from "../../app/lib/logistics/sheet-reader";

// Positions and widths copied from a real Fixy sheet (dompdf, A4 landscape), with fictitious data.
const item = (page: number, x: number, y: number, str: string, width = str.length * 3.4): PdfTextItem => ({
  page,
  x,
  y,
  width,
  str,
});

const summaryPage: PdfTextItem[] = [
  item(1, 227, 537, "PLANILLA DE RECORRIDO", 221),
  item(1, 622, 528, "*16523*", 44),
  item(1, 20, 470, "FECHA:", 46),
  item(1, 68, 470, "29/10/2026", 64),
  // The summary table has GUIA but no DESTINATARIO/COBRAR: it is not the detail table.
  item(1, 97, 366, "CLIENTE", 35),
  item(1, 229, 366, "GUIA AGENTE", 57),
  item(1, 620, 366, "IMPORTE", 39),
  item(1, 17, 348, "Dropi", 21),
  item(1, 619, 348, "529000", 30),
  item(1, 17, 291, "T. Importe:", 60),
  item(1, 79, 291, "529.000,00", 70),
];

const header = (page: number): PdfTextItem[] => [
  item(page, 20, 478, "O", 5),
  item(page, 37, 478, "GUIA", 17),
  // pdfjs merges these two titles into one item.
  item(page, 65, 478, "G.AGENTE SERVICIO", 73),
  item(page, 146, 478, "ZONA", 20),
  item(page, 180, 478, "PESO", 19),
  item(page, 213, 478, "REMITO", 28),
  item(page, 250, 478, "BULTOS", 28),
  item(page, 300, 478, "CLIENTE", 30),
  item(page, 373, 478, "DESTINATARIO", 53),
  item(page, 542, 478, "DIRECCION", 39),
  item(page, 686, 478, "LOCALIDAD", 40),
  item(page, 742, 478, "COBRAR", 29),
  item(page, 793, 478, "OBS", 15),
];

const detailPage: PdfTextItem[] = [
  ...header(2),
  // Row 1: two-line address, "$" and amount on two lines, service on two lines.
  item(2, 17, 457, "1", 4),
  item(2, 31, 457, "220863", 25),
  item(2, 106, 462, "Standard", 30),
  item(2, 118, 453, "A", 5),
  item(2, 188, 458, "1", 4),
  item(2, 249, 457, "1", 4),
  item(2, 283, 457, "Dropi", 18),
  item(2, 350, 457, "Ana Prueba", 40),
  item(2, 452, 463, "GFFQ+VMF Coronel Oviedo - Calle sin nombre / Comercio", 190),
  item(2, 452, 451, "(36 m) 0 - (501)", 52),
  item(2, 675, 457, "CORONEL OVIEDO", 62),
  item(2, 742, 463, "$", 4),
  item(2, 742, 451, "180000", 25),
  // Row 2: remito split in two lines, two-line recipient name, TAVIM.
  item(2, 17, 430, "2", 4),
  item(2, 31, 430, "228625", 25),
  item(2, 106, 435, "Standard", 30),
  item(2, 118, 426, "A", 5),
  item(2, 188, 431, "1", 4),
  item(2, 213, 435, "TVF0E60F-", 33),
  item(2, 213, 426, "695", 13),
  item(2, 249, 430, "1", 4),
  item(2, 283, 430, "TAVIM", 27),
  item(2, 350, 436, "Bruno Ejemplo", 50),
  item(2, 350, 424, "Ficticio", 26),
  item(2, 452, 430, "Calle Ficticia 2 / Barrio: Centro 0 - (5002)", 150),
  item(2, 675, 430, "Coronel Oviedo", 56),
  item(2, 742, 436, "$", 4),
  item(2, 742, 424, "199000", 25),
  // Row 3: same order number as row 2, and the address merged with the locality in one item.
  item(2, 17, 403, "2", 4),
  item(2, 31, 403, "228626", 25),
  item(2, 106, 408, "Standard", 30),
  item(2, 118, 399, "A", 5),
  item(2, 188, 404, "1", 4),
  item(2, 249, 403, "1", 4),
  item(2, 283, 403, "Dropi", 18),
  item(2, 350, 403, "Carla Prueba", 46),
  item(2, 452, 403, "Calle Ejemplo 3 casi Calle Ejemplo 4 - 0 - (501) CORONEL OVIEDO", 285),
  item(2, 742, 409, "$", 4),
  item(2, 742, 397, "150000", 25),
  item(2, 17, 40, "Pagina 1 de 1", 50),
];

const totalsLine: PdfTextItem[] = [
  item(2, 20, 20, "T. cobrar:", 50),
  item(2, 75, 20, "$ 529.000,00", 70),
  item(2, 330, 20, "T. bultos:", 50),
  item(2, 382, 20, "3", 5),
  item(2, 560, 20, "T. guias:", 45),
  item(2, 607, 20, "3", 5),
  item(2, 760, 20, "T. Paradas:", 55),
  item(2, 817, 20, "3", 5),
];

describe("readPdfRouteSheet", () => {
  const sheet = readPdfRouteSheet([...summaryPage, ...detailPage, ...totalsLine]);

  it("reads the sheet number, date and printed totals", () => {
    assert.equal(sheet.sheetNumber, "16523");
    assert.equal(sheet.sheetDate, "2026-10-29");
    assert.deepEqual(sheet.declaredTotals, { amount: 529000, shipments: 3, packages: 3, stops: 3 });
    assert.deepEqual(sheet.problems, []);
  });

  it("puts every cell in its column, joining multi-line cells", () => {
    assert.equal(sheet.rows.length, 3);
    assert.deepEqual(sheet.rows[0], {
      rowNumber: 1,
      sourceOrder: "1",
      trackingNumber: "220863",
      serviceName: "Standard A",
      weight: "1",
      packages: "1",
      senderName: "Dropi",
      recipientName: "Ana Prueba",
      address: "GFFQ+VMF Coronel Oviedo - Calle sin nombre / Comercio (36 m) 0 - (501)",
      locality: "CORONEL OVIEDO",
      amountToCollect: "180000",
    });
  });

  it("glues remitos split across lines and keeps two-line names", () => {
    assert.equal(sheet.rows[1]?.remito, "TVF0E60F-695");
    assert.equal(sheet.rows[1]?.recipientName, "Bruno Ejemplo Ficticio");
    assert.equal(sheet.rows[1]?.senderName, "TAVIM");
  });

  it("separates an address merged with its locality", () => {
    assert.equal(sheet.rows[2]?.address, "Calle Ejemplo 3 casi Calle Ejemplo 4 - 0 - (501)");
    assert.equal(sheet.rows[2]?.locality, "CORONEL OVIEDO");
    assert.equal(sheet.rows[2]?.sourceOrder, "2");
  });

  it("ignores the summary table, page footers and totals", () => {
    const text = JSON.stringify(sheet.rows);
    assert.doesNotMatch(text, /Pagina|T\. cobrar|IMPORTE/);
  });

  it("reports a count different from the printed totals", () => {
    const short = readPdfRouteSheet([
      ...summaryPage,
      ...detailPage.filter((entry) => entry.y > 420 || entry.y >= 478),
      ...totalsLine,
    ]);
    assert.equal(short.rows.length, 2);
    assert.match(short.problems[0] ?? "", /Se leyeron 2 guías y la planilla declara 3/);
  });

  it("explains when the PDF is not a route sheet", () => {
    const other = readPdfRouteSheet([item(1, 20, 500, "Factura N° 1")]);
    assert.equal(other.rows.length, 0);
    assert.match(other.problems[0] ?? "", /No se reconoció la tabla/);
  });
});

describe("buildTemplateCsv", () => {
  it("writes the template so it reads back with the same rows and totals", () => {
    const sheet = readPdfRouteSheet([...summaryPage, ...detailPage, ...totalsLine]);
    const back = readLogisticsSheet(parseCsv(buildTemplateCsv(sheet)));
    assert.equal(back.sheetNumber, "16523");
    assert.equal(back.sheetDate, "2026-10-29");
    assert.deepEqual(back.declaredTotals, sheet.declaredTotals);
    const withoutRowNumber = (rows: typeof sheet.rows) =>
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "rowNumber")));
    assert.deepEqual(withoutRowNumber(back.rows), withoutRowNumber(sheet.rows));
  });
});
