import "server-only";

import { getProductForMerchant } from "../services/commerce-services";
import {
  orderFulfillmentValidationMessage,
  type OrderFulfillmentType,
} from "./order-fulfillment";

type OrderItemReference = {
  productId: number | string;
};

export async function validateOrderItemsFulfillment({
  accessToken,
  fulfillmentType,
  items,
}: {
  accessToken: string;
  fulfillmentType: OrderFulfillmentType;
  items: OrderItemReference[];
}) {
  const productIds = Array.from(
    new Set(items.map((item) => String(item.productId)))
  );
  const products = await Promise.all(
    productIds.map((productId) =>
      getProductForMerchant({ accessToken, productId })
    )
  );

  return orderFulfillmentValidationMessage(products, fulfillmentType);
}
