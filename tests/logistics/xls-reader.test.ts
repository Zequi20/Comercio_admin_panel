import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readLogisticsSheet } from "../../app/lib/logistics/sheet-reader";
import { readXlsMatrix, XlsReadError } from "../../app/lib/logistics/xls-reader";

/*
 * A tiny writer of Excel 97-2003 files, only for these tests: an OLE compound file (512-byte
 * sectors) holding a "Workbook" stream of BIFF8 records. Real carrier files carry personal data,
 * so they are not kept in the repository.
 */

const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const u32 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const f64 = (value: number) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return Array.from(new Uint8Array(view.buffer));
};
const rec = (id: number, data: number[]) => [...u16(id), ...u16(data.length), ...data];
const latin = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const utf16 = (text: string) => Array.from(text).flatMap((char) => u16(char.charCodeAt(0)));

/** A shared string table whose second string is split across SST and CONTINUE. */
function sstRecords(strings: string[]): number[] {
  const [first, split, ...rest] = strings;
  const half = Math.floor(split.length / 2);
  // The split string starts compressed in SST and continues as UTF-16 (flag byte 1) in CONTINUE.
  const head = [
    ...u32(strings.length),
    ...u32(strings.length),
    ...u16(first.length), 0, ...latin(first),
    ...u16(split.length), 0, ...latin(split.slice(0, half)),
  ];
  const tail = [1, ...utf16(split.slice(half)), ...rest.flatMap((text) => [...u16(text.length), 0, ...latin(text)])];
  return [...rec(0x00fc, head), ...rec(0x003c, tail)];
}

const rkInt = (value: number) => ((value << 2) | 2) >>> 0;

function workbookStream(options: { version?: number; encrypted?: boolean } = {}): number[] {
  const version = options.version ?? 0x0600;
  const strings = ["GUIA", "DESTINATARIO Ñandú Pérez", "COBRAR", "$ 149000", "CELULAR", "Planilla"];
  const globals = [
    ...rec(0x0809, [...u16(version), ...u16(0x0005), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...(options.encrypted ? rec(0x002f, [0, 0]) : []),
    ...sstRecords(strings),
    ...rec(0x000a, []),
  ];
  const sheet = [
    ...rec(0x0809, [...u16(version), ...u16(0x0010), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    // Row 0: "Planilla" | 16523 as a formula with a numeric result.
    ...rec(0x00fd, [...u16(0), ...u16(0), ...u16(0), ...u32(5)]),
    ...rec(0x0006, [...u16(0), ...u16(1), ...u16(0), ...f64(16523), ...u16(0), ...u32(0), ...u16(0)]),
    // Row 1: headers GUIA | DESTINATARIO… | COBRAR | CELULAR (the last one as an inline LABEL).
    ...rec(0x00fd, [...u16(1), ...u16(0), ...u16(0), ...u32(0)]),
    ...rec(0x00fd, [...u16(1), ...u16(1), ...u16(0), ...u32(1)]),
    ...rec(0x00fd, [...u16(1), ...u16(2), ...u16(0), ...u32(2)]),
    ...rec(0x0204, [...u16(1), ...u16(3), ...u16(0), ...u16(7), 0, ...latin("CELULAR")]),
    // Row 2: guide as RK, recipient as a formula with a string result, amount as text, phone as NUMBER.
    ...rec(0x027e, [...u16(2), ...u16(0), ...u16(0), ...u32(rkInt(224331))]),
    ...rec(0x0006, [...u16(2), ...u16(1), ...u16(0), 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...u16(0), ...u32(0), ...u16(0)]),
    ...rec(0x0207, [...u16(5), 1, ...utf16("María")]),
    ...rec(0x00fd, [...u16(2), ...u16(2), ...u16(0), ...u32(3)]),
    ...rec(0x0203, [...u16(2), ...u16(3), ...u16(0), ...f64(981343973)]),
    // Row 3: two values in one MULRK (a guide, then 18 stored as 1800 with the "divide by 100" flag).
    ...rec(0x00bd, [...u16(3), ...u16(0), ...u16(0), ...u32(rkInt(217208)), ...u16(0), ...u32(((1800 << 2) | 3) >>> 0), ...u16(1)]),
    ...rec(0x000a, []),
  ];
  return [...globals, ...sheet];
}

/** Wraps a stream in a compound file: FAT in sector 0, directory in sector 1, stream from 2. */
function compoundFile(stream: number[], streamName = "Workbook", pad = true): Uint8Array {
  const data = [...stream];
  if (pad) while (data.length < 4096) data.push(0);
  const streamSectors = Math.ceil(data.length / 512);
  const header = new Array(512).fill(0);
  header.splice(0, 8, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  header.splice(24, 2, ...u16(0x003e));
  header.splice(26, 2, ...u16(0x0003));
  header.splice(28, 2, ...u16(0xfffe));
  header.splice(30, 2, ...u16(9));
  header.splice(32, 2, ...u16(6));
  header.splice(44, 4, ...u32(1));
  header.splice(48, 4, ...u32(1));
  header.splice(56, 4, ...u32(pad ? 4096 : 0));
  header.splice(60, 4, ...u32(0xfffffffe));
  header.splice(68, 4, ...u32(0xfffffffe));
  header.splice(76, 4, ...u32(0));
  for (let i = 1; i < 109; i += 1) header.splice(76 + i * 4, 4, ...u32(0xffffffff));

  const fat = new Array(128).fill(0xffffffff);
  fat[0] = 0xfffffffd;
  fat[1] = 0xfffffffe;
  for (let i = 0; i < streamSectors; i += 1) fat[2 + i] = i === streamSectors - 1 ? 0xfffffffe : 3 + i;

  const entry = (name: string, type: number, start: number, size: number) => {
    const bytes = new Array(128).fill(0);
    utf16(name).forEach((byte, index) => (bytes[index] = byte));
    bytes.splice(64, 2, ...u16((name.length + 1) * 2));
    bytes[66] = type;
    bytes.splice(68, 4, ...u32(0xffffffff));
    bytes.splice(72, 4, ...u32(0xffffffff));
    bytes.splice(76, 4, ...u32(type === 5 ? 1 : 0xffffffff));
    bytes.splice(116, 4, ...u32(start));
    bytes.splice(120, 4, ...u32(size));
    return bytes;
  };
  const directory = [
    ...entry("Root Entry", 5, 0xfffffffe, 0),
    ...entry(streamName, 2, 2, data.length),
    ...new Array(256).fill(0),
  ];
  const body = [...fat.flatMap(u32), ...directory, ...data, ...new Array(streamSectors * 512 - data.length).fill(0)];
  return Uint8Array.from([...header, ...body]);
}

describe("lector de .xls", () => {
  it("reads shared, split and inline strings, numbers, RK, MULRK and formulas", () => {
    const matrix = readXlsMatrix(compoundFile(workbookStream()));
    assert.deepEqual(matrix[0], ["Planilla", 16523]);
    assert.deepEqual(matrix[1], ["GUIA", "DESTINATARIO Ñandú Pérez", "COBRAR", "CELULAR"]);
    assert.deepEqual(matrix[2], [224331, "María", "$ 149000", 981343973]);
    assert.deepEqual(matrix[3], [217208, 18]);
  });

  it("feeds the sheet reader and puts back the phone's leading zero", () => {
    const matrix = readXlsMatrix(compoundFile(workbookStream()));
    matrix[1][1] = "DESTINATARIO";
    const sheet = readLogisticsSheet(matrix);
    assert.equal(sheet.sheetNumber, "16523");
    assert.deepEqual(sheet.rows[0], {
      rowNumber: 3,
      trackingNumber: 224331,
      recipientName: "María",
      amountToCollect: "$ 149000",
      recipientPhone: "0981343973",
    });
  });

  it("explains files it cannot read", () => {
    assert.throws(() => readXlsMatrix(new TextEncoder().encode("guia,cobrar\n1,2")), XlsReadError);
    assert.throws(() => readXlsMatrix(compoundFile(workbookStream({ encrypted: true }))), /contraseña/);
    assert.throws(() => readXlsMatrix(compoundFile(workbookStream({ version: 0x0500 }))), /Excel 95/);
    assert.throws(() => readXlsMatrix(compoundFile(workbookStream(), "Book")), /Excel 95/);
  });

  it("takes BULTOS REALES over BULTOS when the export has both", () => {
    const sheet = readLogisticsSheet([
      ["Planilla", "16523"],
      ["GUIA", "BULTOS", "BULTOS REALES", "COBRAR", "DIRECCION"],
      [224331, 2, 1, "$ 149000", "Calle A"],
    ]);
    assert.equal(sheet.rows[0].packages, 1);
    assert.deepEqual(sheet.problems, []);
    const plain = readLogisticsSheet([
      ["Planilla", "16523"],
      ["GUIA", "BULTOS", "COBRAR", "DIRECCION"],
      [224331, 2, "$ 149000", "Calle A"],
    ]);
    assert.equal(plain.rows[0].packages, 2);
  });
});
