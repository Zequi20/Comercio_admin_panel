import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseCsv,
  parseDeclaredNumber,
  parseSheetDate,
  readLogisticsSheet,
  TEMPLATE_COLUMNS,
  type SheetCellValue,
} from "../../app/lib/logistics/sheet-reader";

const header = TEMPLATE_COLUMNS.map((column) => column.header);

const templateMatrix = (rows: SheetCellValue[][]): SheetCellValue[][] => [
  ["Planilla", "16523"],
  ["Fecha", new Date("2026-10-29T00:00:00.000Z")],
  ["Total importe", "22.641.760,00"],
  ["Total guías", 115],
  ["Total bultos", 139],
  ["Total paradas", 114],
  [],
  header,
  ...rows,
];

const row = (values: Partial<Record<string, SheetCellValue>>): SheetCellValue[] =>
  header.map((name) => values[name] ?? null);

describe("readLogisticsSheet", () => {
  it("reads the header block, the totals and the rows of the template", () => {
    const parsed = readLogisticsSheet(
      templateMatrix([
        row({
          guia: 220863,
          orden: "44",
          remitente: "Dropi",
          destinatario: "Destinatario Prueba",
          direccion: "GFFQ+VMF Coronel Oviedo - Calle sin nombre 0 - (501)",
          localidad: "CORONEL OVIEDO",
          bultos: 1,
          peso: 1,
          cobrar: 180000,
        }),
        [],
        row({ guia: "228956", direccion: "Calle 2", bultos: "2", cobrar: "189.000" }),
      ])
    );

    assert.equal(parsed.sheetNumber, "16523");
    assert.equal(parsed.sheetDate, "2026-10-29");
    assert.deepEqual(parsed.declaredTotals, {
      amount: 22641760,
      shipments: 115,
      packages: 139,
      stops: 114,
    });
    assert.deepEqual(parsed.problems, []);
    assert.equal(parsed.rows.length, 2);
    assert.deepEqual(parsed.rows[0], {
      rowNumber: 9,
      trackingNumber: 220863,
      sourceOrder: "44",
      senderName: "Dropi",
      recipientName: "Destinatario Prueba",
      address: "GFFQ+VMF Coronel Oviedo - Calle sin nombre 0 - (501)",
      locality: "CORONEL OVIEDO",
      packages: 1,
      weight: 1,
      amountToCollect: 180000,
    });
    // Row numbers follow the spreadsheet, skipping empty lines.
    assert.equal(parsed.rows[1]?.rowNumber, 11);
    assert.equal(parsed.rows[1]?.amountToCollect, "189.000");
  });

  it("accepts Fixy column names and accents", () => {
    const parsed = readLogisticsSheet([
      ["Planilla", "*16523*"],
      ["GUÍA", "CLIENTE", "DIRECCIÓN", "BULTOS", "COBRAR", "OBS"],
      ["220863", "TAVIM", "Calle 1", "1", "199000", "Llamar"],
    ]);
    assert.equal(parsed.sheetNumber, "16523");
    assert.deepEqual(parsed.rows[0], {
      rowNumber: 3,
      trackingNumber: "220863",
      senderName: "TAVIM",
      address: "Calle 1",
      packages: "1",
      amountToCollect: "199000",
      notes: "Llamar",
    });
  });

  it("explains what is missing", () => {
    assert.match(readLogisticsSheet([["foo", "bar"]]).problems[0] ?? "", /encabezados/);
    const parsed = readLogisticsSheet([["guia", "cobrar"], ["1", "100"]]);
    assert.ok(parsed.problems.some((problem) => problem.includes('"direccion"')));
    assert.ok(parsed.problems.some((problem) => problem.includes("número de planilla")));
    assert.equal(parsed.declaredTotals, null);
  });
});

describe("parsers", () => {
  it("reads declared numbers in Paraguayan formats", () => {
    assert.equal(parseDeclaredNumber("22.641.760,00"), 22641760);
    assert.equal(parseDeclaredNumber("$ 180.000"), 180000);
    assert.equal(parseDeclaredNumber(139), 139);
    assert.equal(parseDeclaredNumber("n/a"), null);
  });

  it("reads sheet dates", () => {
    assert.equal(parseSheetDate("29/10/2026"), "2026-10-29");
    assert.equal(parseSheetDate("2026-10-29"), "2026-10-29");
    assert.equal(parseSheetDate("ayer"), null);
  });

  it("reads CSV with quotes, semicolons and CRLF", () => {
    assert.deepEqual(parseCsv('﻿guia;direccion;cobrar\r\n1;"Calle 1; casa ""azul""";180000\r\n'), [
      ["guia", "direccion", "cobrar"],
      ["1", 'Calle 1; casa "azul"', "180000"],
    ]);
    assert.deepEqual(parseCsv("a,b\n1,2"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
