import type {
  OrderFulfillmentType,
  OrderItemPayload,
  OrderPayload,
  OrderStatus,
} from "../services/commerce-services";
import { normalizeCanonicalOrderStatus } from "../generated/order-status-contract";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readFulfillmentType(value: unknown): OrderFulfillmentType {
  return value === "PICKUP" ? "PICKUP" : "DELIVERY";
}

function readStatus(value: unknown): OrderStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return normalizeCanonicalOrderStatus(value);
}

function readPositiveInteger(value: unknown) {
  const numeric = Number(value);

  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function orderItemsFromClient(value: unknown): OrderItemPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const productId = readPositiveInteger(record.productId);
      const quantity = readPositiveInteger(record.quantity);

      if (!productId || !quantity) {
        return null;
      }

      return { productId, quantity } satisfies OrderItemPayload;
    })
    .filter((item): item is OrderItemPayload => item !== null);
}

export function orderPayloadFromClient(
  value: unknown,
  merchantId: number | string
): OrderPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fulfillmentType = readFulfillmentType(record.fulfillmentType);
  const address = readString(record.address);
  const notes = readString(record.notes);
  const currency = readString(record.currency);
  const items = orderItemsFromClient(record.items);

  return {
    merchantId,
    fulfillmentType,
    ...(address ? { address } : {}),
    ...(notes ? { notes } : {}),
    ...(currency ? { currency } : {}),
    items,
  };
}

export function orderItemsPayloadFromClient(value: unknown):
  | {
      items: OrderItemPayload[];
      expectedVersion?: number;
    }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    items: orderItemsFromClient(record.items),
    ...(typeof record.expectedVersion === "number"
      ? { expectedVersion: record.expectedVersion }
      : {}),
  };
}

export function orderStatusPayloadFromClient(value: unknown):
  | {
      toStatus?: OrderStatus;
      expectedVersion?: number;
    }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    toStatus: readStatus(record.toStatus),
    ...(typeof record.expectedVersion === "number"
      ? { expectedVersion: record.expectedVersion }
      : {}),
  };
}

export function orderAssignmentPayloadFromClient(value: unknown):
  | {
      courierId?: number;
      expectedVersion?: number;
    }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const courierId = readPositiveInteger(record.courierId);

  return {
    ...(courierId ? { courierId } : {}),
    ...(typeof record.expectedVersion === "number"
      ? { expectedVersion: record.expectedVersion }
      : {}),
  };
}

export function orderEstimatedDeliveryPayloadFromClient(value: unknown):
  | {
      estimatedDeliveryAt?: string;
      expectedVersion?: number;
    }
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const estimatedDeliveryAt = readString(record.estimatedDeliveryAt);

  return {
    ...(estimatedDeliveryAt ? { estimatedDeliveryAt } : {}),
    ...(typeof record.expectedVersion === "number"
      ? { expectedVersion: record.expectedVersion }
      : {}),
  };
}
