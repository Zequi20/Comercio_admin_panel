import "server-only";

import { randomUUID } from "node:crypto";

import { serviceUrls } from "../env";
import { parseJsonSafely } from "../problem-details";

export type LogisticsApiResult = { status: number; body: unknown };

/** Paths of orders-svc /logistics the portal may reach (admin session only). */
const ALLOWED_PATHS = [
  /^contract$/,
  /^carriers$/,
  /^imports$/,
  /^imports\/\d+$/,
  /^imports\/\d+\/rows\/\d+$/,
  /^imports\/\d+\/(discard|confirm)$/,
  /^routes$/,
  /^routes\/\d+$/,
  /^routes\/\d+\/(settlement|settlement\/preview|history|receipt|close)$/,
  /^shipments\/\d+\/history$/,
];

export const isAllowedLogisticsPath = (path: string) =>
  ALLOWED_PATHS.some((pattern) => pattern.test(path));

/**
 * Calls orders-svc and returns its status and body untouched, so the browser sees the business
 * error codes (TOTALS_MISMATCH, IMPORT_SHEET_ALREADY_EXISTS, ...) and can react to them.
 */
export async function logisticsRequest({
  path,
  method = "GET",
  accessToken,
  body,
  search = "",
  idempotencyKey,
}: {
  path: string;
  method?: "GET" | "POST" | "PATCH";
  accessToken: string;
  body?: unknown;
  search?: string;
  idempotencyKey?: string | null;
}): Promise<LogisticsApiResult> {
  const response = await fetch(`${serviceUrls.orders}/logistics/${path}${search}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "Idempotency-Key": idempotencyKey || randomUUID() }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = text ? parseJsonSafely(text) : null;
  return {
    status: response.status,
    body: parsed ?? (text ? { message: text } : null),
  };
}

export async function logisticsJson<T>(
  options: Parameters<typeof logisticsRequest>[0]
): Promise<T> {
  const result = await logisticsRequest(options);
  if (result.status < 200 || result.status >= 300) {
    const problem = result.body as { detail?: string; message?: string } | null;
    throw new Error(problem?.detail || problem?.message || "El servicio de logística no respondió.");
  }
  return result.body as T;
}
