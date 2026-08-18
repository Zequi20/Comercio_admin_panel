type OrderWithType = {
  orderType?: string | null;
  status?: string | null;
};

export function isCustomDeliveryOrder(order: OrderWithType) {
  return order.orderType === "CUSTOM";
}

const customStatusTransitions: Record<string, string[]> = {
  PLACED: ["CANCELED"],
  CONFIRMED: ["CANCELED"],
  ASSIGNED: ["PICKED_UP", "CANCELED"],
  PICKED_UP: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};

export function customOrderNextStatuses(order: OrderWithType) {
  return customStatusTransitions[order.status ?? "PLACED"] ?? [];
}

export function canTransitionCustomOrder(
  order: OrderWithType,
  toStatus: string
) {
  return customOrderNextStatuses(order).includes(toStatus);
}
