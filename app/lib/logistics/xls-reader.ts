/**
 * Reads the first worksheet of a legacy Excel 97-2003 file (.xls, BIFF8 inside an OLE compound
 * file) as a matrix of cells, the same shape the .xlsx reader returns. Carriers export their route
 * sheets in this format. No dependencies: only the records a route sheet uses are decoded (shared
 * and inline strings, numbers, formulas with their cached result, booleans); styles and dates are
 * not interpreted, so a date comes back as its spreadsheet serial number.
 */

import type { SheetCellValue } from "./sheet-reader";

export class XlsReadError extends Error {}

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const MAX_REGULAR_SECTOR = 0xfffffffa;
const STREAM = 2;
const MAX_ROWS = 65_536;
const MAX_COLUMNS = 256;

const record = {
  BOF: 0x0809,
  EOF: 0x000a,
  FILEPASS: 0x002f,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  BOOLERR: 0x0205,
  FORMULA: 0x0006,
  STRING: 0x0207,
} as const;

/** Extracts the "Workbook" stream from the OLE compound file. */
function workbookStream(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 512 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new XlsReadError("El archivo no es un Excel .xls válido.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);

  const sectorSize = 1 << u16(30);
  const miniSectorSize = 1 << u16(32);
  const fatSectors = u32(44);
  const directoryStart = u32(48);
  const miniCutoff = u32(56);
  const miniFatStart = u32(60);
  let difatNext = u32(68);
  const difatCount = u32(72);
  const sectorOffset = (sector: number) => (sector + 1) * sectorSize;
  const entriesPerSector = sectorSize / 4;

  const fatLocations: number[] = [];
  for (let index = 0; index < 109; index += 1) fatLocations.push(u32(76 + index * 4));
  for (let index = 0; index < difatCount && difatNext < MAX_REGULAR_SECTOR; index += 1) {
    const base = sectorOffset(difatNext);
    for (let entry = 0; entry < entriesPerSector - 1; entry += 1) fatLocations.push(u32(base + entry * 4));
    difatNext = u32(base + (entriesPerSector - 1) * 4);
  }
  const fat: number[] = [];
  for (const location of fatLocations.slice(0, fatSectors)) {
    if (location >= MAX_REGULAR_SECTOR) continue;
    const base = sectorOffset(location);
    if (base + sectorSize > bytes.length) throw new XlsReadError("El archivo .xls está incompleto.");
    for (let entry = 0; entry < entriesPerSector; entry += 1) fat.push(u32(base + entry * 4));
  }

  const chain = (start: number, table: number[]): number[] => {
    const sectors: number[] = [];
    const seen = new Set<number>();
    for (let sector = start; sector < MAX_REGULAR_SECTOR; sector = table[sector] ?? END_OF_CHAIN) {
      if (seen.has(sector) || sector >= table.length) throw new XlsReadError("El archivo .xls está dañado.");
      seen.add(sector);
      sectors.push(sector);
    }
    return sectors;
  };
  const readStream = (start: number): Uint8Array => {
    const sectors = chain(start, fat);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((sector, index) => {
      out.set(bytes.subarray(sectorOffset(sector), sectorOffset(sector) + sectorSize), index * sectorSize);
    });
    return out;
  };

  const directory = readStream(directoryStart);
  const directoryView = new DataView(directory.buffer);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directoryView.getUint16(offset + 64, true);
    let name = "";
    for (let i = 0; i + 2 <= Math.max(nameLength - 2, 0); i += 2) {
      name += String.fromCharCode(directoryView.getUint16(offset + i, true));
    }
    entries.push({
      name,
      type: directory[offset + 66],
      start: directoryView.getUint32(offset + 116, true),
      size: directoryView.getUint32(offset + 120, true),
    });
  }
  const workbook = entries.find((entry) => entry.type === STREAM && entry.name === "Workbook");
  if (!workbook) {
    if (entries.some((entry) => entry.type === STREAM && entry.name === "Book")) {
      throw new XlsReadError("El archivo es de Excel 95 o anterior. Guardalo como .xlsx y volvé a subirlo.");
    }
    throw new XlsReadError("El archivo .xls no tiene hojas de cálculo.");
  }

  if (workbook.size >= miniCutoff) return readStream(workbook.start).subarray(0, workbook.size);

  // Small streams live in the mini stream, addressed through the mini FAT.
  const root = entries[0];
  const miniStream = readStream(root.start);
  const miniFat: number[] = [];
  for (const sector of chain(miniFatStart, fat)) {
    const base = sectorOffset(sector);
    for (let entry = 0; entry < entriesPerSector; entry += 1) miniFat.push(u32(base + entry * 4));
  }
  const sectors = chain(workbook.start, miniFat);
  const out = new Uint8Array(sectors.length * miniSectorSize);
  sectors.forEach((sector, index) => {
    out.set(miniStream.subarray(sector * miniSectorSize, (sector + 1) * miniSectorSize), index * miniSectorSize);
  });
  return out.subarray(0, workbook.size);
}

/** An RK number: a compressed integer or the high 30 bits of a double, optionally divided by 100. */
function rkValue(rk: number): number {
  let value: number;
  if (rk & 2) {
    value = rk >> 2;
  } else {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setUint32(4, rk & 0xfffffffc, true);
    value = buffer.getFloat64(0, true);
  }
  return rk & 1 ? value / 100 : value;
}

/** Reads the shared string table, whose strings may continue across CONTINUE records. */
function readSharedStrings(blocks: Uint8Array[]): string[] {
  const strings: string[] = [];
  let block = 0;
  let position = 8;
  const current = () => blocks[block];
  const ensure = () => {
    while (block < blocks.length && position >= current().length) {
      block += 1;
      position = 0;
    }
    if (block >= blocks.length) throw new XlsReadError("La tabla de textos del .xls está incompleta.");
  };
  const readU8 = () => {
    ensure();
    return current()[position++];
  };
  const readU16 = () => readU8() | (readU8() << 8);
  const readU32 = () => (readU16() | (readU16() << 16)) >>> 0;
  const skip = (count: number) => {
    let left = count;
    while (left > 0) {
      ensure();
      const take = Math.min(left, current().length - position);
      position += take;
      left -= take;
    }
  };

  const total = new DataView(blocks[0].buffer, blocks[0].byteOffset).getUint32(4, true);
  for (let index = 0; index < total; index += 1) {
    const length = readU16();
    const flags = readU8();
    const runs = flags & 0x08 ? readU16() : 0;
    const extended = flags & 0x04 ? readU32() : 0;
    let wide = (flags & 0x01) === 1;
    let text = "";
    let left = length;
    while (left > 0) {
      if (position >= current().length) {
        // A string split across records restarts with its own encoding flag.
        block += 1;
        position = 0;
        if (block >= blocks.length) throw new XlsReadError("La tabla de textos del .xls está incompleta.");
        wide = (current()[position++] & 0x01) === 1;
      }
      const width = wide ? 2 : 1;
      const take = Math.min(left, Math.floor((current().length - position) / width));
      for (let i = 0; i < take; i += 1) {
        text += String.fromCharCode(
          wide ? current()[position] | (current()[position + 1] << 8) : current()[position]
        );
        position += width;
      }
      left -= take;
    }
    strings.push(text);
    skip(runs * 4 + extended);
  }
  return strings;
}

/** An inline string (LABEL, STRING): 16-bit length, encoding flag, characters. */
function inlineString(data: Uint8Array, offset: number): string {
  const length = data[offset] | (data[offset + 1] << 8);
  const wide = (data[offset + 2] & 0x01) === 1;
  let text = "";
  for (let i = 0, position = offset + 3; i < length && position < data.length; i += 1) {
    text += String.fromCharCode(wide ? data[position] | (data[position + 1] << 8) : data[position]);
    position += wide ? 2 : 1;
  }
  return text;
}

/** First worksheet of a .xls file as a matrix of cells (row by row, from column A). */
export function readXlsMatrix(file: ArrayBuffer | Uint8Array): SheetCellValue[][] {
  const stream = workbookStream(file instanceof Uint8Array ? file : new Uint8Array(file));
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);

  const records: { id: number; data: Uint8Array }[] = [];
  for (let offset = 0; offset + 4 <= stream.length; ) {
    const id = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    records.push({ id, data: stream.subarray(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }

  let strings: string[] = [];
  let sheetIndex = -1;
  let pendingFormula: [number, number] | null = null;
  const sheets: Map<number, Map<number, SheetCellValue>>[] = [];
  const set = (row: number, column: number, value: SheetCellValue) => {
    if (sheetIndex < 0 || row >= MAX_ROWS || column >= MAX_COLUMNS) return;
    const sheet = sheets[sheetIndex];
    if (!sheet.has(row)) sheet.set(row, new Map());
    sheet.get(row)!.set(column, value);
  };

  for (let index = 0; index < records.length; index += 1) {
    const { id, data } = records[index];
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const u16 = (offset: number) => dv.getUint16(offset, true);
    switch (id) {
      case record.BOF: {
        if (u16(0) !== 0x0600) {
          throw new XlsReadError("El archivo es de Excel 95 o anterior. Guardalo como .xlsx y volvé a subirlo.");
        }
        if (u16(2) === 0x0010) {
          sheetIndex = sheets.length;
          sheets.push(new Map());
        }
        break;
      }
      case record.FILEPASS:
        throw new XlsReadError("El archivo .xls está protegido con contraseña. Quitásela y volvé a subirlo.");
      case record.SST: {
        const blocks = [data];
        while (records[index + 1]?.id === record.CONTINUE) blocks.push(records[++index].data);
        strings = readSharedStrings(blocks);
        break;
      }
      case record.LABELSST:
        set(u16(0), u16(2), strings[dv.getUint32(6, true)] ?? null);
        break;
      case record.LABEL:
        set(u16(0), u16(2), inlineString(data, 6));
        break;
      case record.NUMBER:
        set(u16(0), u16(2), dv.getFloat64(6, true));
        break;
      case record.RK:
        set(u16(0), u16(2), rkValue(dv.getUint32(6, true)));
        break;
      case record.MULRK: {
        const row = u16(0);
        const first = u16(2);
        const count = (data.length - 6) / 6;
        for (let i = 0; i < count; i += 1) set(row, first + i, rkValue(dv.getUint32(4 + i * 6 + 2, true)));
        break;
      }
      case record.BOOLERR:
        set(u16(0), u16(2), data[7] === 0 ? data[6] === 1 : null);
        break;
      case record.FORMULA: {
        const row = u16(0);
        const column = u16(2);
        if (u16(12) !== 0xffff) {
          set(row, column, dv.getFloat64(6, true));
        } else if (data[6] === 0) {
          pendingFormula = [row, column];
        } else if (data[6] === 1) {
          set(row, column, data[8] === 1);
        }
        break;
      }
      case record.STRING:
        if (pendingFormula) set(pendingFormula[0], pendingFormula[1], inlineString(data, 0));
        pendingFormula = null;
        break;
      default:
        break;
    }
  }

  const sheet = sheets.find((candidate) => candidate.size > 0);
  if (!sheet) return [];
  const lastRow = Math.max(...sheet.keys());
  const matrix: SheetCellValue[][] = [];
  for (let row = 0; row <= lastRow; row += 1) {
    const cells = sheet.get(row);
    if (!cells) {
      matrix.push([]);
      continue;
    }
    const values: SheetCellValue[] = [];
    for (let column = 0; column <= Math.max(...cells.keys()); column += 1) values.push(cells.get(column) ?? null);
    matrix.push(values);
  }
  return matrix;
}
