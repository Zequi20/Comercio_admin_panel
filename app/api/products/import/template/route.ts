import { NextResponse } from "next/server";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const templateColumns = [
  "sku",
  "name",
  "description",
  "price",
  "currency",
  "available",
  "type",
  "metadata",
];

const fieldGuideRows = [
  ["Campo", "Requerido", "Formato"],
  ["sku", "Sí", "Texto único. Las filas con SKU duplicado se rechazan."],
  ["name", "Sí", "Nombre visible del producto o servicio."],
  ["description", "No", "Descripción breve."],
  ["price", "Sí", "Número mayor a 0. Ejemplo: 45000."],
  ["currency", "Sí", "Código de moneda de 3 letras. Ejemplo: PYG."],
  ["available", "No", "true o false."],
  ["type", "No", "PRODUCT o SERVICE."],
  ["metadata", "No", 'JSON. Ejemplo: {"category":"comidas"}'],
];

type ZipFile = {
  name: string;
  content: string | Buffer;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index;
  let name = "";

  while (value >= 0) {
    name = String.fromCharCode((value % 26) + 65) + name;
    value = Math.floor(value / 26) - 1;
  }

  return name;
}

function cell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function row(index: number, values: string[]) {
  const cells = values
    .map((value, cellIndex) => {
      const reference = `${columnName(cellIndex)}${index}`;
      return cell(reference, value);
    })
    .join("");

  return `<row r="${index}">${cells}</row>`;
}

function worksheetXml(rows: string[][]) {
  const sheetRows = rows
    .map((values, index) => row(index + 1, values))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="34" customWidth="1"/>
    <col min="4" max="8" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function localFileHeader({
  crc,
  name,
  size,
}: {
  crc: number;
  name: Buffer;
  size: number;
}) {
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);

  return header;
}

function centralDirectoryHeader({
  crc,
  name,
  offset,
  size,
}: {
  crc: number;
  name: Buffer;
  offset: number;
  size: number;
}) {
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);

  return header;
}

function endOfCentralDirectory({
  centralDirectoryOffset,
  centralDirectorySize,
  fileCount,
}: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  fileCount: number;
}) {
  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(fileCount, 8);
  header.writeUInt16LE(fileCount, 10);
  header.writeUInt32LE(centralDirectorySize, 12);
  header.writeUInt32LE(centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);

  return header;
}

function createZip(files: ZipFile[]) {
  let offset = 0;
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, "utf8");
    const crc = crc32(content);
    const localHeader = localFileHeader({
      crc,
      name,
      size: content.length,
    });

    localParts.push(localHeader, name, content);
    centralParts.push(
      centralDirectoryHeader({
        crc,
        name,
        offset,
        size: content.length,
      }),
      name
    );

    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = endOfCentralDirectory({
    centralDirectoryOffset: offset,
    centralDirectorySize: centralDirectory.length,
    fileCount: files.length,
  });

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createTemplateWorkbook() {
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Productos" sheetId="1" r:id="rId1"/>
    <sheet name="Guia" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: worksheetXml([templateColumns]),
    },
    {
      name: "xl/worksheets/sheet2.xml",
      content: worksheetXml(fieldGuideRows),
    },
  ]);
}

export async function GET() {
  const workbook = createTemplateWorkbook();

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
      "Content-Type": XLSX_MIME,
    },
  });
}
