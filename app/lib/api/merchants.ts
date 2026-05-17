import type { MerchantDetails } from "../auth/types";

export type MerchantPayload = Pick<MerchantDetails, "isOpen">;

export function merchantPayloadFromClient(value: unknown): MerchantPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const isOpen = (value as Record<string, unknown>).isOpen;

  if (typeof isOpen !== "boolean") {
    return null;
  }

  return { isOpen };
}
