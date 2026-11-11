import type { LogisticsProblem, RouteStatus, ShipmentStatus } from "./types";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; problem: LogisticsProblem };

const toProblem = (status: number, body: unknown): LogisticsProblem => {
  const problem =
    body && typeof body === "object" && !Array.isArray(body) ? (body as LogisticsProblem) : {};
  return { status, ...problem };
};

/** Calls the portal proxy; business errors come back with their API code. */
export async function logisticsFetch<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; idempotencyKey?: string } = {}
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`/api/logistics/${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }
    return response.ok
      ? { ok: true, status: response.status, data: body as T }
      : { ok: false, status: response.status, problem: toProblem(response.status, body) };
  } catch {
    return {
      ok: false,
      status: 0,
      problem: { message: "No hay conexión con el portal. Reintentá en unos segundos." },
    };
  }
}

export const problemMessage = (problem: LogisticsProblem, fallback: string): string =>
  (typeof problem.detail === "string" && problem.detail) ||
  (typeof problem.message === "string" && problem.message) ||
  fallback;

const guaranies = new Intl.NumberFormat("es-PY", {
  style: "currency",
  currency: "PYG",
  maximumFractionDigits: 0,
});

export const formatGs = (value: number | string | null | undefined): string => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? guaranies.format(numeric) : "—";
};

export const formatDateTime = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat("es-PY", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Asuncion",
      }).format(new Date(value))
    : "—";

export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  ASSIGNED: "Asignado",
  IN_PROGRESS: "En curso",
  CLOSED: "Cerrado",
};

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING_RECEIPT: "Por recibir",
  RECEIVED: "Recibido",
  MISSING: "Faltante",
  DELIVERED: "Entregado",
  FAILED: "No entregado",
  RETURN_PENDING: "A devolver",
};

/** Maps statuses onto the pill colors already defined in globals.css. */
export const statusPillClass = (status: ShipmentStatus | RouteStatus | string): string => {
  switch (status) {
    case "DELIVERED":
    case "CLOSED":
      return "pill done";
    case "FAILED":
    case "MISSING":
    case "RETURN_PENDING":
      return "pill error";
    case "IN_PROGRESS":
    case "RECEIVED":
      return "pill assigned";
    case "ASSIGNED":
    case "PENDING_RECEIPT":
      return "pill pending";
    default:
      return "pill";
  }
};

export const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
