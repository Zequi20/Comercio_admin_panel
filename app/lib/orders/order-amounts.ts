export type OrderPaymentMethod = "CASH" | "TRANSFER";

export type OrderDeliveryLocation = {
  latitude: number;
  longitude: number;
};

type Amount = number | string | null | undefined;

type OrderAmountFields = {
  total?: Amount;
  subtotal?: Amount;
  deliveryFee?: Amount;
};

type OrderPaymentFields = OrderAmountFields & {
  paymentMethod?: OrderPaymentMethod | null;
  cashAmount?: Amount;
  changeDue?: Amount;
};

export function orderAmount(value: Amount) {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

// El total de los pedidos de catálogo incluye el envío; las ventas del comercio no.
// Los pedidos sin desglose (mandados o anteriores al envío calculado) usan el total.
export function orderMerchandiseAmount(order: OrderAmountFields) {
  const subtotal = orderAmount(order.subtotal);
  if (subtotal !== null) return subtotal;

  const total = orderAmount(order.total);
  if (total === null) return null;

  return total - (orderAmount(order.deliveryFee) ?? 0);
}

export function orderPaymentMethodLabel(method?: OrderPaymentMethod | null) {
  if (method === "CASH") return "Efectivo";
  if (method === "TRANSFER") return "Transferencia";
  return null;
}

// La API deja changeDue en null cuando el efectivo informado ya no cubre el total,
// por ejemplo después de agregar ítems al pedido.
export function orderCashIsShort(order: OrderPaymentFields) {
  const cashAmount = orderAmount(order.cashAmount);
  const total = orderAmount(order.total);

  return (
    order.paymentMethod === "CASH" &&
    cashAmount !== null &&
    total !== null &&
    cashAmount < total
  );
}

export function orderPaymentSummary(
  order: OrderPaymentFields,
  formatPrice: (value: number) => string
) {
  const methodLabel = orderPaymentMethodLabel(order.paymentMethod);
  if (!methodLabel) return null;
  if (order.paymentMethod !== "CASH") return methodLabel;

  const cashAmount = orderAmount(order.cashAmount);
  if (cashAmount === null) return `${methodLabel} · monto justo`;

  const changeDue = orderAmount(order.changeDue);
  const parts = [methodLabel, `paga con ${formatPrice(cashAmount)}`];
  if (changeDue !== null && changeDue > 0) {
    parts.push(`vuelto ${formatPrice(changeDue)}`);
  }

  return parts.join(" · ");
}

export function telHref(phone: string) {
  const dialable = phone.replace(/[^\d+]/g, "");
  return dialable ? `tel:${dialable}` : null;
}
