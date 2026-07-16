export type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELED";

export type OrderFulfillmentType = "DELIVERY" | "PICKUP";

export type OrderWorkflowShape = {
  status?: OrderStatus | string | null;
  fulfillmentType?: OrderFulfillmentType | string | null;
  courier?: { id?: number | string | null } | null;
};

const statusLabels: Record<OrderStatus, string> = {
  PLACED: "Creado",
  CONFIRMED: "Confirmado",
  ASSIGNED: "Asignado",
  PICKED_UP: "En camino",
  DELIVERED: "Entregado",
  CANCELED: "Cancelado",
};

const statuses = new Set<OrderStatus>([
  "PLACED",
  "CONFIRMED",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "CANCELED",
]);

function normalizedOrderStatus(value?: string | null): OrderStatus {
  const normalized = value === "CANCELLED" ? "CANCELED" : value;

  return statuses.has(normalized as OrderStatus)
    ? (normalized as OrderStatus)
    : "PLACED";
}

function hasAssignedCourier(order: OrderWorkflowShape) {
  return (
    order.courier?.id !== null &&
    order.courier?.id !== undefined &&
    String(order.courier.id).trim() !== ""
  );
}

export function orderStatusLabel(value?: string | null) {
  return statusLabels[normalizedOrderStatus(value)];
}

export function canAssignCourierToOrder(order: OrderWorkflowShape) {
  return (
    order.fulfillmentType !== "PICKUP" &&
    normalizedOrderStatus(order.status) === "CONFIRMED" &&
    !hasAssignedCourier(order)
  );
}

export function assignmentBlockedReason(order: OrderWorkflowShape) {
  if (order.fulfillmentType === "PICKUP") {
    return "Las órdenes de retiro no requieren repartidor.";
  }

  if (hasAssignedCourier(order)) {
    return "La orden ya tiene un repartidor asignado.";
  }

  if (normalizedOrderStatus(order.status) !== "CONFIRMED") {
    return "Solo se puede asignar repartidor cuando la orden está confirmada.";
  }

  return null;
}

export function nextOrderStatuses(order: OrderWorkflowShape): OrderStatus[] {
  const status = normalizedOrderStatus(order.status);

  if (status === "PLACED") {
    return ["CONFIRMED", "CANCELED"];
  }

  if (status === "CONFIRMED") {
    if (order.fulfillmentType === "PICKUP") {
      return ["PICKED_UP", "CANCELED"];
    }

    if (hasAssignedCourier(order)) {
      return ["ASSIGNED", "PICKED_UP", "CANCELED"];
    }

    return ["CANCELED"];
  }

  if (status === "ASSIGNED") {
    return ["PICKED_UP", "CANCELED"];
  }

  if (status === "PICKED_UP") {
    return ["DELIVERED", "CANCELED"];
  }

  return [];
}

export function availableOrderStatuses(order: OrderWorkflowShape) {
  const currentStatus = normalizedOrderStatus(order.status);
  return [currentStatus, ...nextOrderStatuses(order)];
}

export function canTransitionOrderStatus(
  order: OrderWorkflowShape,
  toStatus: string
) {
  const normalizedTarget = normalizedOrderStatus(toStatus);
  return availableOrderStatuses(order).includes(normalizedTarget);
}

export function statusTransitionBlockedReason(
  order: OrderWorkflowShape,
  toStatus: string
) {
  const currentStatus = normalizedOrderStatus(order.status);
  const targetStatus = normalizedOrderStatus(toStatus);

  if (currentStatus === "DELIVERED" || currentStatus === "CANCELED") {
    return `El estado ${orderStatusLabel(currentStatus)} es terminal.`;
  }

  if (targetStatus === "ASSIGNED" && canAssignCourierToOrder(order)) {
    return "Para asignar delivery usá la acción de asignación de repartidor.";
  }

  return `No se puede pasar de ${orderStatusLabel(
    currentStatus
  )} a ${orderStatusLabel(targetStatus)} según el flujo del pedido.`;
}
