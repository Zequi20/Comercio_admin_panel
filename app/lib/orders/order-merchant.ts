type OrderMerchantReference = {
  id?: number | string | null;
};

type OrderWithMerchant = {
  merchantId?: number | string | null;
  merchant?: OrderMerchantReference | null;
};

export function orderMerchantId(order: OrderWithMerchant) {
  const merchantId = order.merchantId ?? order.merchant?.id;

  if (merchantId === null || merchantId === undefined || merchantId === "") {
    return null;
  }

  return merchantId;
}

export function orderBelongsToMerchant(
  order: OrderWithMerchant,
  merchantId: number | string
) {
  const currentMerchantId = orderMerchantId(order);

  return (
    currentMerchantId !== null &&
    String(currentMerchantId) === String(merchantId)
  );
}
