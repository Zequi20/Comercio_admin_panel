type OrderWithType = {
  orderType?: string | null;
};

export function isCustomDeliveryOrder(order: OrderWithType) {
  return order.orderType === "CUSTOM";
}
