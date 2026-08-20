import "server-only";

import ExcelJS from "exceljs";

import {
  isSupportedImageUrl,
  parseImageUrl,
} from "../image-url";

const TECHNICAL_HEADERS = ["imageurl", "category", "servicemode"] as const;
const SERVICE_MODES = new Set(["DELIVERY", "PICKUP", "DELIVERY_PICKUP"]);

export class ProductImportNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImportNormalizationError";
  }
}

function cellText(cell: ExcelJS.Cell) {
  return cell.text.trim();
}

function headerColumns(worksheet: ExcelJS.Worksheet) {
  const columns = new Map<string, number>();

  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = cellText(cell).toLowerCase();

    if (header) {
      columns.set(header, columnNumber);
    }
  });

  return columns;
}

function metadataFromCell(cell: ExcelJS.Cell, rowNumber: number) {
  const text = cellText(cell);

  if (!text) {
    return {};
  }

  try {
    const metadata = JSON.parse(text) as unknown;

    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>;
    }
  } catch {
    // The error below gives the customer the row that needs attention.
  }

  throw new ProductImportNormalizationError(
    `La metadata de la fila ${rowNumber} debe ser un objeto JSON válido.`
  );
}

function valueForHeader(
  row: ExcelJS.Row,
  columns: Map<string, number>,
  header: string
) {
  const column = columns.get(header);
  return column ? cellText(row.getCell(column)) : "";
}

export async function normalizeProductImportFile(file: File) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ProductImportNormalizationError(
      "El archivo seleccionado no es un libro .xlsx válido."
    );
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new ProductImportNormalizationError(
      "El archivo no contiene una hoja de productos."
    );
  }

  const columns = headerColumns(worksheet);
  const hasTechnicalColumns = TECHNICAL_HEADERS.some((header) =>
    columns.has(header)
  );
  const hasMetadataColumn = columns.has("metadata");

  if (!hasTechnicalColumns && !hasMetadataColumn) {
    return file;
  }

  let metadataColumn = columns.get("metadata");

  if (!metadataColumn) {
    metadataColumn = worksheet.columnCount + 1;
    worksheet.getRow(1).getCell(metadataColumn).value = "metadata";
    columns.set("metadata", metadataColumn);
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const imageUrl = valueForHeader(row, columns, "imageurl");
    const category = valueForHeader(row, columns, "category");
    const serviceModeValue = valueForHeader(row, columns, "servicemode");
    const metadataCell = row.getCell(metadataColumn);
    const hasTechnicalValues = Boolean(imageUrl || category || serviceModeValue);

    if (!hasTechnicalValues && !cellText(metadataCell)) {
      return;
    }

    if (imageUrl && !isSupportedImageUrl(imageUrl)) {
      throw new ProductImportNormalizationError(
        `La imagen de la fila ${rowNumber} debe ser una URL válida.`
      );
    }

    const serviceMode = serviceModeValue.toUpperCase();

    if (serviceMode && !SERVICE_MODES.has(serviceMode)) {
      throw new ProductImportNormalizationError(
        `El modo de servicio de la fila ${rowNumber} debe ser DELIVERY, PICKUP o DELIVERY_PICKUP.`
      );
    }

    const metadata = metadataFromCell(metadataCell, rowNumber);

    if (imageUrl) {
      metadata.imageUrl = parseImageUrl(imageUrl);
    } else if (typeof metadata.imageUrl === "string") {
      metadata.imageUrl = parseImageUrl(metadata.imageUrl);
    }

    if (category) {
      metadata.category = category;
    }

    if (serviceMode) {
      metadata.serviceMode = serviceMode;
    }

    metadataCell.value = JSON.stringify(metadata);
  });

  const normalizedWorkbook = await workbook.xlsx.writeBuffer();

  return new File([new Uint8Array(normalizedWorkbook)], file.name, {
    type: file.type,
  });
}
