import type { LogisticsProblem } from "./types";

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

const dateTime = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Asuncion",
});

/** "12/11/2026 09:32", always day/month/year and 24 h. */
export const formatDateTime = (value: string | null | undefined): string =>
  value ? dateTime.format(new Date(value)).replace(",", "") : "—";

/** Business dates come as "2026-11-12"; shown as "12/11/2026" without time-zone shifts. */
export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

/**
 * A money difference in words, never with a bare sign: "Faltan Gs. 30.000", "Sobran Gs. 5.000" or
 * "Sin diferencia". `difference` is collected minus what should have been collected.
 */
export const describeMoneyDifference = (difference: number): string =>
  difference === 0
    ? "Sin diferencia"
    : difference < 0
      ? `Faltan ${formatGs(-difference)}`
      : `Sobran ${formatGs(difference)}`;

/** "2 guías menos que la planilla", "1 bulto más que la planilla" or "Igual que la planilla". */
export const describeCountDifference = (
  difference: number,
  singular: string,
  plural: string
): string =>
  difference === 0
    ? "Igual que la planilla"
    : `${Math.abs(difference)} ${Math.abs(difference) === 1 ? singular : plural} ${difference < 0 ? "menos" : "más"} que la planilla`;

export const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
