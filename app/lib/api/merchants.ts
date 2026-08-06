import type { MerchantDetails } from "../auth/types";

export type MerchantPayload = Partial<
  Pick<MerchantDetails, "isOpen" | "metadata">
>;

export type AdminMerchantPayload = Partial<
  Pick<
    MerchantDetails,
    "name" | "contactEmail" | "deliveryCost" | "isOpen" | "metadata"
  >
>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function adminMerchantPayloadFromClient(
  value: unknown,
  { requireIdentity = false }: { requireIdentity?: boolean } = {}
): { ok: true; payload: AdminMerchantPayload } | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Enviá los datos del comercio." };
  }

  const input = value as Record<string, unknown>;
  const payload: AdminMerchantPayload = {};

  if (requireIdentity || "name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
      return { ok: false, message: "Ingresá el nombre del comercio." };
    }
    payload.name = name;
  }

  if (requireIdentity || "contactEmail" in input) {
    const contactEmail =
      typeof input.contactEmail === "string"
        ? input.contactEmail.trim().toLowerCase()
        : "";
    if (!emailPattern.test(contactEmail)) {
      return { ok: false, message: "Ingresá un correo de contacto válido." };
    }
    payload.contactEmail = contactEmail;
  }

  if ("deliveryCost" in input) {
    const deliveryCost = Number(input.deliveryCost);
    if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
      return { ok: false, message: "Ingresá un costo de envío válido." };
    }
    payload.deliveryCost = deliveryCost;
  }

  if ("isOpen" in input) {
    if (typeof input.isOpen !== "boolean") {
      return { ok: false, message: "El estado del comercio no es válido." };
    }
    payload.isOpen = input.isOpen;
  }

  if ("metadata" in input) {
    const metadata = readMetadata(input.metadata);
    if (!metadata) {
      return { ok: false, message: "La metadata debe ser un objeto JSON." };
    }
    payload.metadata = metadata;
  }

  if (!Object.keys(payload).length) {
    return { ok: false, message: "No hay cambios válidos para actualizar." };
  }

  return { ok: true, payload };
}
