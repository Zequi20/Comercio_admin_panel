import type { CourierPayload } from "../services/commerce-services";

export type CourierClientPayload = CourierPayload & {
  email?: string;
  password?: string;
  nickname?: string;
  phone?: string;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function courierPayloadFromClient(
  value: unknown
): CourierClientPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const email = readString(record.email);
  const password = readString(record.password);
  const nickname = readString(record.nickname);
  const name = readString(record.name);
  const phone = readString(record.phone);
  const metadata = readMetadata(record.metadata);

  return {
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
    ...(nickname ? { nickname } : {}),
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
