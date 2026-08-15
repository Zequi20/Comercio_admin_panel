type EntityId = number | string;

type ProductType = "PRODUCT" | "SERVICE";
export type OrderFulfillmentType = "DELIVERY" | "PICKUP";

export const ORDER_FULFILLMENT_TYPES: readonly OrderFulfillmentType[] = [
  "DELIVERY",
  "PICKUP",
];

type ServiceAwareProduct = {
  id: EntityId;
  type?: ProductType;
  metadata?: Record<string, unknown> | null;
};

type ServiceAwareOrderItem = {
  productId?: EntityId;
  type?: ProductType;
  productType?: ProductType;
  product?: {
    type?: ProductType;
  } | null;
};

export function serviceProductIdSet(products: ServiceAwareProduct[]) {
  return new Set(
    products
      .filter((product) => product.type === "SERVICE")
      .map((product) => String(product.id))
  );
}

export function orderContainsService(
  items: ServiceAwareOrderItem[] | null | undefined,
  serviceProductIds: ReadonlySet<string>
) {
  return Boolean(
    items?.some(
      (item) =>
        item.type === "SERVICE" ||
        item.productType === "SERVICE" ||
        item.product?.type === "SERVICE" ||
        (item.productId !== null &&
          item.productId !== undefined &&
          serviceProductIds.has(String(item.productId)))
    )
  );
}

export function productFulfillmentTypes(
  product: ServiceAwareProduct
): readonly OrderFulfillmentType[] {
  const serviceMode = product.metadata?.serviceMode;
  const normalizedMode =
    typeof serviceMode === "string" ? serviceMode.trim().toUpperCase() : "";

  if (normalizedMode === "DELIVERY") {
    return ["DELIVERY"];
  }

  if (normalizedMode === "PICKUP") {
    return ["PICKUP"];
  }

  return ORDER_FULFILLMENT_TYPES;
}

export function orderFulfillmentCompatibility(
  products: ServiceAwareProduct[]
) {
  const allowedFulfillmentTypes = ORDER_FULFILLMENT_TYPES.filter(
    (fulfillmentType) =>
      products.every((product) =>
        productFulfillmentTypes(product).includes(fulfillmentType)
      )
  );
  const containsService = products.some(
    (product) => product.type === "SERVICE"
  );
  const containsProduct = products.some(
    (product) => product.type !== "SERVICE"
  );

  return {
    allowedFulfillmentTypes,
    containsProduct,
    containsService,
    isMixed: containsProduct && containsService,
  };
}

export function orderFulfillmentLabel(
  fulfillmentType: "DELIVERY" | "PICKUP" | string | null | undefined,
  containsService: boolean
) {
  if (containsService) {
    return fulfillmentType === "PICKUP" ? "En local" : "A domicilio";
  }

  return fulfillmentType === "PICKUP" ? "Retiro" : "Delivery";
}

export function orderFulfillmentValidationMessage(
  products: ServiceAwareProduct[],
  fulfillmentType: OrderFulfillmentType
) {
  const compatibility = orderFulfillmentCompatibility(products);

  if (!compatibility.allowedFulfillmentTypes.length) {
    return "Los ítems seleccionados no comparten una modalidad compatible. Separá los productos y servicios en pedidos distintos.";
  }

  if (!compatibility.allowedFulfillmentTypes.includes(fulfillmentType)) {
    const requestedLabel = orderFulfillmentLabel(
      fulfillmentType,
      compatibility.containsService
    );
    const availableLabels = compatibility.allowedFulfillmentTypes
      .map((type) =>
        orderFulfillmentLabel(type, compatibility.containsService)
      )
      .join(" o ");

    return `La modalidad ${requestedLabel} no es compatible con todos los ítems. Usá ${availableLabels} o separá el pedido.`;
  }

  return null;
}
