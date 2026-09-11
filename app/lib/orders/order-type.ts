import { ORDER_STATUS_WORKFLOWS } from "@/app/lib/generated/order-status-contract";

type OrderWithType = {
  orderType?: string | null;
  status?: string | null;
};

export function isCustomDeliveryOrder(order: OrderWithType) {
  return order.orderType === "CUSTOM";
}

const [placedStatus, confirmedStatus, assignedStatus, pickedUpStatus, deliveredStatus] =
  ORDER_STATUS_WORKFLOWS.DELIVERY;
const customStatusTransitions: Record<string, string[]> = {
  [placedStatus]: ["CANCELED"],
  [confirmedStatus]: ["CANCELED"],
  [assignedStatus]: [pickedUpStatus, "CANCELED"],
  [pickedUpStatus]: [deliveredStatus],
  [deliveredStatus]: [],
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
