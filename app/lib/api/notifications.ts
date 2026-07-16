export const MAX_NOTIFICATION_RECIPIENTS = 500;
export const MAX_NOTIFICATION_TITLE_LENGTH = 120;
export const MAX_NOTIFICATION_BODY_LENGTH = 500;

export type ManualNotificationPayload = {
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

type ParseResult =
  | { ok: true; payload: ManualNotificationPayload }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPositiveUserId(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  return Number.isSafeInteger(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function readData(value: unknown):
  | { ok: true; data?: Record<string, string> }
  | { ok: false; message: string } {
  if (value === undefined) return { ok: true };

  if (!isRecord(value)) {
    return { ok: false, message: "Los datos opcionales deben ser un objeto JSON." };
  }

  const entries = Object.entries(value);
  if (entries.length > 20) {
    return { ok: false, message: "Los datos opcionales admiten hasta 20 campos." };
  }

  const data: Record<string, string> = {};
  for (const [rawKey, entry] of entries) {
    const key = rawKey.trim();

    if (!key || key.length > 64) {
      return {
        ok: false,
        message: "Cada clave de datos debe tener entre 1 y 64 caracteres.",
      };
    }

    if (typeof entry !== "string") {
      return { ok: false, message: `El campo data.${key} debe ser texto.` };
    }

    if (entry.length > 500) {
      return {
        ok: false,
        message: `El campo data.${key} supera los 500 caracteres.`,
      };
    }

    data[key] = entry;
  }

  return Object.keys(data).length ? { ok: true, data } : { ok: true };
}

export function parseManualNotificationPayload(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "El cuerpo de la solicitud no es válido." };
  }

  if (!Array.isArray(value.userIds)) {
    return { ok: false, message: "Seleccioná al menos un destinatario." };
  }

  const userIds = Array.from(
    new Set(value.userIds.map(readPositiveUserId).filter((id) => id !== null))
  );

  if (userIds.length !== value.userIds.length) {
    return { ok: false, message: "La lista de destinatarios contiene IDs inválidos." };
  }

  if (!userIds.length) {
    return { ok: false, message: "Seleccioná al menos un destinatario." };
  }

  if (userIds.length > MAX_NOTIFICATION_RECIPIENTS) {
    return {
      ok: false,
      message: `Podés enviar a un máximo de ${MAX_NOTIFICATION_RECIPIENTS} usuarios por vez.`,
    };
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";

  if (!title) {
    return { ok: false, message: "Ingresá el título de la notificación." };
  }

  if (title.length > MAX_NOTIFICATION_TITLE_LENGTH) {
    return {
      ok: false,
      message: `El título admite hasta ${MAX_NOTIFICATION_TITLE_LENGTH} caracteres.`,
    };
  }

  if (!body) {
    return { ok: false, message: "Ingresá el cuerpo de la notificación." };
  }

  if (body.length > MAX_NOTIFICATION_BODY_LENGTH) {
    return {
      ok: false,
      message: `El cuerpo admite hasta ${MAX_NOTIFICATION_BODY_LENGTH} caracteres.`,
    };
  }

  const dataResult = readData(value.data);
  if (!dataResult.ok) return dataResult;

  return {
    ok: true,
    payload: {
      userIds,
      title,
      body,
      ...(dataResult.data ? { data: dataResult.data } : {}),
    },
  };
}
