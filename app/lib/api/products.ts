import type { ProductPayload, ProductType } from "../services/commerce-services";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readProductType(value: unknown): ProductType {
  return value === "SERVICE" ? "SERVICE" : "PRODUCT";
}

function readMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function productPayloadFromClient(value: unknown): ProductPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = readString(record.name);
  const sku = readString(record.sku);
  const currency = readString(record.currency);
  const description = readString(record.description);
  const metadata = readMetadata(record.metadata);

  return {
    type: readProductType(record.type),
    ...(sku ? { sku } : {}),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(record.price !== undefined
      ? { price: record.price as number | string }
      : {}),
    ...(currency ? { currency } : {}),
    ...(typeof record.available === "boolean"
      ? { available: record.available }
      : {}),
    ...(metadata ? { metadata } : {}),
  };
}
