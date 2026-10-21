// GENERATED FILE. Source: Y4pido-api/packages/shared/src/order-status-contract.json
export const ORDER_STATUS_CONTRACT_VERSION = 1 as const;
export const ORDER_STATUS_VALUES = [
  "PLACED",
  "CONFIRMED",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "CANCELED"
] as const;
export type CanonicalOrderStatus = "PLACED" | "CONFIRMED" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELED";
export type OrderFulfillmentType = "DELIVERY" | "PICKUP";
/** SERVICE orders are PICKUP; the profile only changes how they are presented. */
export type OrderStatusProfile = OrderFulfillmentType | "SERVICE";

export const ORDER_STATUS_ALIASES: Readonly<Record<string, CanonicalOrderStatus>> = {
  "PENDING": "PLACED",
  "ORDER_CREATED": "PLACED",
  "CREATED": "PLACED",
  "READY": "CONFIRMED",
  "AVAILABLE": "CONFIRMED",
  "READY_FOR_PICKUP": "CONFIRMED",
  "READY_FOR_DELIVERY": "CONFIRMED",
  "PREPARING": "CONFIRMED",
  "BEING_PREPARED": "CONFIRMED",
  "ACCEPTED": "ASSIGNED",
  "ORDER_ACCEPTED": "ASSIGNED",
  "HEADING_TO_MERCHANT": "ASSIGNED",
  "GOING_TO_MERCHANT": "ASSIGNED",
  "ARRIVING_TO_MERCHANT": "ASSIGNED",
  "PICKEDUP": "PICKED_UP",
  "IN_TRANSIT": "PICKED_UP",
  "ON_THE_WAY": "PICKED_UP",
  "OUT_FOR_DELIVERY": "PICKED_UP",
  "HEADING_TO_CUSTOMER": "PICKED_UP",
  "DISPATCHED": "PICKED_UP",
  "COMPLETED": "DELIVERED",
  "DONE": "DELIVERED",
  "FULFILLED": "DELIVERED",
  "CANCELLED": "CANCELED",
  "REJECTED": "CANCELED",
  "DECLINED": "CANCELED",
  "VOIDED": "CANCELED"
};
export const ORDER_STATUS_WORKFLOWS = {
  "DELIVERY": [
    "PLACED",
    "CONFIRMED",
    "ASSIGNED",
    "PICKED_UP",
    "DELIVERED"
  ],
  "PICKUP": [
    "PLACED",
    "CONFIRMED",
    "DELIVERED"
  ]
} as const;
export const ORDER_STATUS_TERMINAL_VALUES = [
  "DELIVERED",
  "CANCELED"
] as const;
export const ORDER_STATUS_COURIER_TRACKING_VALUES = [
  "ASSIGNED",
  "PICKED_UP"
] as const;
export const ORDER_STATUS_VISUAL_TIMELINES = {
  "customer": {
    "DELIVERY": [
      "CREATED",
      "CONFIRMED",
      "ASSIGNED",
      "IN_TRANSIT",
      "DELIVERED"
    ],
    "PICKUP": [
      "CREATED",
      "CONFIRMED",
      "DELIVERED"
    ],
    "SERVICE": [
      "CREATED",
      "CONFIRMED",
      "DELIVERED"
    ]
  },
  "merchant": {
    "DELIVERY": [
      "PLACED",
      "CONFIRMED",
      "ASSIGNED",
      "PICKED_UP",
      "DELIVERED"
    ],
    "PICKUP": [
      "PLACED",
      "CONFIRMED",
      "DELIVERED"
    ],
    "SERVICE": [
      "PLACED",
      "CONFIRMED",
      "DELIVERED"
    ]
  },
  "courier": {
    "DELIVERY": [
      "ASSIGNED",
      "PICKED_UP",
      "DELIVERED"
    ],
    "PICKUP": [
      "ASSIGNED",
      "PICKED_UP",
      "DELIVERED"
    ],
    "SERVICE": [
      "ASSIGNED",
      "PICKED_UP",
      "DELIVERED"
    ]
  }
} as const;
export const ORDER_STATUS_LABELS = {
  "customer": {
    "DELIVERY": {
      "PLACED": "Recibido",
      "CONFIRMED": "Buscando repartidor",
      "ASSIGNED": "Repartidor asignado",
      "PICKED_UP": "En camino",
      "DELIVERED": "Entregado",
      "CANCELED": "Cancelado"
    },
    "PICKUP": {
      "PLACED": "Recibido",
      "CONFIRMED": "En preparación",
      "ASSIGNED": "En preparación",
      "PICKED_UP": "Listo para retirar",
      "DELIVERED": "Retirado",
      "CANCELED": "Cancelado"
    },
    "SERVICE": {
      "PLACED": "Recibido",
      "CONFIRMED": "Confirmado",
      "ASSIGNED": "Confirmado",
      "PICKED_UP": "Confirmado",
      "DELIVERED": "Realizado",
      "CANCELED": "Cancelado"
    }
  },
  "merchant": {
    "DELIVERY": {
      "PLACED": "Creado",
      "CONFIRMED": "Confirmado",
      "ASSIGNED": "Repartidor asignado",
      "PICKED_UP": "En camino",
      "DELIVERED": "Entregado",
      "CANCELED": "Cancelado"
    },
    "PICKUP": {
      "PLACED": "Creado",
      "CONFIRMED": "En preparación",
      "ASSIGNED": "En preparación",
      "PICKED_UP": "Retirado",
      "DELIVERED": "Retirado",
      "CANCELED": "Cancelado"
    },
    "SERVICE": {
      "PLACED": "Creado",
      "CONFIRMED": "Confirmado",
      "ASSIGNED": "Confirmado",
      "PICKED_UP": "Confirmado",
      "DELIVERED": "Realizado",
      "CANCELED": "Cancelado"
    }
  },
  "courier": {
    "DELIVERY": {
      "PLACED": "Recibido",
      "CONFIRMED": "Listo para retirar en local",
      "ASSIGNED": "Repartidor asignado",
      "PICKED_UP": "En camino",
      "DELIVERED": "Entregado",
      "CANCELED": "Cancelado"
    },
    "PICKUP": {
      "PLACED": "Recibido",
      "CONFIRMED": "Listo para retirar en local",
      "ASSIGNED": "Repartidor asignado",
      "PICKED_UP": "En camino",
      "DELIVERED": "Entregado",
      "CANCELED": "Cancelado"
    },
    "SERVICE": {
      "PLACED": "Recibido",
      "CONFIRMED": "Listo para retirar en local",
      "ASSIGNED": "Repartidor asignado",
      "PICKED_UP": "En camino",
      "DELIVERED": "Entregado",
      "CANCELED": "Cancelado"
    }
  }
} as const;

const canonicalStatuses = new Set<string>(ORDER_STATUS_VALUES);

export function normalizeCanonicalOrderStatus(value: unknown): CanonicalOrderStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (canonicalStatuses.has(normalized)) return normalized as CanonicalOrderStatus;
  return ORDER_STATUS_ALIASES[normalized];
}

export function orderStatusContractLabel(
  status: unknown,
  audience: "customer" | "merchant" | "courier" = "merchant",
  profile: OrderStatusProfile = "DELIVERY",
): string {
  const canonical = normalizeCanonicalOrderStatus(status) ?? "PLACED";
  return ORDER_STATUS_LABELS[audience][profile][canonical];
}
