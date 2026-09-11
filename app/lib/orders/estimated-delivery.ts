import {
  normalizeCanonicalOrderStatus,
  ORDER_STATUS_TERMINAL_VALUES,
} from "@/app/lib/generated/order-status-contract";

const FINAL_ORDER_STATUSES: ReadonlySet<string> = new Set(
  ORDER_STATUS_TERMINAL_VALUES,
);

export function canEditEstimatedDelivery(status?: string | null) {
  const normalized = normalizeCanonicalOrderStatus(status);
  return normalized === undefined || !FINAL_ORDER_STATUSES.has(normalized);
}

export function estimatedDeliveryInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function estimatedDeliveryIsoFromInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isFutureEstimatedDelivery(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function estimatedDeliveryChanged(
  currentValue: string | null | undefined,
  nextInputValue: string
) {
  return estimatedDeliveryInputValue(currentValue) !== nextInputValue;
}

export function formatEstimatedDelivery(value?: string | null) {
  if (!value) return "Sin estimación";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin estimación";

  const now = new Date();
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDifference = Math.round(
    (targetDay.getTime() - today.getTime()) / 86_400_000
  );
  const time = new Intl.DateTimeFormat("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  if (dayDifference === 0) return `Hoy, ${time}`;
  if (dayDifference === 1) return `Mañana, ${time}`;
  return new Intl.DateTimeFormat("es-PY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
