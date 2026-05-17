import type { MerchantDetails } from "../auth/types";

export type MerchantPayload = Partial<
  Pick<MerchantDetails, "isOpen" | "metadata">
>;

function readMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function merchantPayloadFromClient(value: unknown): MerchantPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const payload: MerchantPayload = {};

  if ("isOpen" in input) {
    if (typeof input.isOpen !== "boolean") {
      return null;
    }

    payload.isOpen = input.isOpen;
  }

  if ("metadata" in input) {
    const metadata = readMetadata(input.metadata);

    if (!metadata) {
      return null;
    }

    payload.metadata = metadata;
  }

  return Object.keys(payload).length ? payload : null;
}
