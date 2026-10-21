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

// A service is always PICKUP: its serviceMode only says where it is performed
// (the professional goes to the customer, or the customer attends), and the
// merchant arranges it by phone. No courier is ever searched for it.
export function productFulfillmentTypes(
  product: ServiceAwareProduct
): readonly OrderFulfillmentType[] {
  if (product.type === "SERVICE") {
    return ["PICKUP"];
  }

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

// Services are ordered on their own: the professional cannot be counted on to
// carry products. The orders API rejects mixed orders too.
export function orderFulfillmentCompatibility(
  products: ServiceAwareProduct[]
) {
  const containsService = products.some(
    (product) => product.type === "SERVICE"
  );
  const containsProduct = products.some(
    (product) => product.type !== "SERVICE"
  );
  const isMixed = containsProduct && containsService;
  const allowedFulfillmentTypes = isMixed
    ? []
    : ORDER_FULFILLMENT_TYPES.filter((fulfillmentType) =>
        products.every((product) =>
          productFulfillmentTypes(product).includes(fulfillmentType)
        )
      );

  return {
    allowedFulfillmentTypes,
    containsProduct,
    containsService,
    isMixed,
  };
}

// Service orders are PICKUP orders with service lines. Older DELIVERY orders
// with services kept the courier flow and read as delivery.
export function isServiceOrder(
  fulfillmentType: string | null | undefined,
  containsService: boolean
) {
  return fulfillmentType === "PICKUP" && containsService;
}

export function orderFulfillmentLabel(
  fulfillmentType: "DELIVERY" | "PICKUP" | string | null | undefined,
  containsService: boolean
) {
  if (isServiceOrder(fulfillmentType, containsService)) {
    return "Servicio";
  }

  return fulfillmentType === "PICKUP" ? "Retiro" : "Delivery";
}

// The customer app only sends an address when the professional goes there.
export function servicePlaceLabel(address: string | null | undefined) {
  return address?.trim() ? "En el domicilio del cliente" : "En el local";
}

export const SERVICE_ORDER_MIXED_MESSAGE =
  "Los servicios se piden por separado. Creá un pedido para los servicios y otro para los productos.";

export function orderFulfillmentValidationMessage(
  products: ServiceAwareProduct[],
  fulfillmentType: OrderFulfillmentType
) {
  const compatibility = orderFulfillmentCompatibility(products);

  if (compatibility.isMixed) {
    return SERVICE_ORDER_MIXED_MESSAGE;
  }

  if (compatibility.containsService && fulfillmentType === "DELIVERY") {
    return "Los servicios no usan repartidor: se cargan como pedido de servicio y se coordinan con el cliente.";
  }

  if (!compatibility.allowedFulfillmentTypes.length) {
    return "Los ítems seleccionados no comparten una modalidad compatible. Separá el pedido.";
  }

  if (!compatibility.allowedFulfillmentTypes.includes(fulfillmentType)) {
    const requestedLabel = orderFulfillmentLabel(fulfillmentType, false);
    const availableLabels = compatibility.allowedFulfillmentTypes
      .map((type) => orderFulfillmentLabel(type, false))
      .join(" o ");

    return `La modalidad ${requestedLabel} no es compatible con todos los ítems. Usá ${availableLabels} o separá el pedido.`;
  }

  return null;
}
