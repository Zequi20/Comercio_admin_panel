import {
  normalizeCanonicalOrderStatus,
  ORDER_STATUS_WORKFLOWS,
  orderStatusContractLabel,
  type CanonicalOrderStatus,
  type OrderFulfillmentType as ContractFulfillmentType,
} from "@/app/lib/generated/order-status-contract";

export type OrderStatus = CanonicalOrderStatus;

export type OrderFulfillmentType = ContractFulfillmentType;

export type OrderWorkflowShape = {
  status?: OrderStatus | string | null;
  fulfillmentType?: OrderFulfillmentType | string | null;
  courier?: { id?: number | string | null } | null;
};

function normalizedOrderStatus(value?: string | null): OrderStatus {
  return normalizeCanonicalOrderStatus(value) ?? "PLACED";
}

function hasAssignedCourier(order: OrderWorkflowShape) {
  return (
    order.courier?.id !== null &&
    order.courier?.id !== undefined &&
    String(order.courier.id).trim() !== ""
  );
}

export function isOrderSearchingCourier(order: OrderWorkflowShape) {
  return (
    order.fulfillmentType !== "PICKUP" &&
    normalizedOrderStatus(order.status) === "CONFIRMED" &&
    !hasAssignedCourier(order)
  );
}

export function orderStatusLabel(value?: string | null) {
  return orderStatusContractLabel(value, "merchant", "DELIVERY");
}

// A service order (PICKUP with service lines) reads "Confirmado" and
// "Realizado": the merchant arranges it with the customer.
export function orderStatusLabelForOrder(
  order: OrderWorkflowShape,
  isServiceOrder = false
) {
  if (isServiceOrder) {
    return orderStatusContractLabel(order.status, "merchant", "SERVICE");
  }

  return isOrderSearchingCourier(order)
    ? "Buscando repartidor"
    : orderStatusLabel(order.status);
}

export function canAssignCourierToOrder(order: OrderWorkflowShape) {
  return isOrderSearchingCourier(order);
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
  const deliveryWorkflow = ORDER_STATUS_WORKFLOWS.DELIVERY;
  const pickupWorkflow = ORDER_STATUS_WORKFLOWS.PICKUP;
  const canceled: OrderStatus = "CANCELED";

  if (status === deliveryWorkflow[0]) {
    return [deliveryWorkflow[1], canceled];
  }

  if (status === deliveryWorkflow[1]) {
    if (order.fulfillmentType === "PICKUP") {
      return [pickupWorkflow[2], canceled];
    }

    if (hasAssignedCourier(order)) {
      return [deliveryWorkflow[2], canceled];
    }

    return [canceled];
  }

  if (status === deliveryWorkflow[2]) {
    return [deliveryWorkflow[3], canceled];
  }

  if (status === deliveryWorkflow[3]) {
    return order.fulfillmentType === "PICKUP" ? [] : [deliveryWorkflow[4]];
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
