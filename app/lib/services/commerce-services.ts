import "server-only";

import { serviceUrls } from "../env";
import { extractErrorMessage, parseJsonSafely } from "../problem-details";

export type ListResponse<T> = {
  data: T[];
  cursor?: number | string | null;
};

export type ProductType = "PRODUCT" | "SERVICE";

export type Product = {
  id: number | string;
  merchantId: number | string;
  type?: ProductType;
  sku?: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency: string;
  available: boolean;
  metadata?: Record<string, unknown> | null;
};

export type ProductPayload = {
  type?: ProductType;
  sku?: string;
  name?: string;
  description?: string | null;
  price?: number | string;
  currency?: string;
  available?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELED";

export type OrderFulfillmentType = "DELIVERY" | "PICKUP";

export type EntityReference = {
  id: number | string;
  email?: string | null;
  nickname?: string | null;
  name?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
};

export type CourierReference = {
  id: number | string;
  name?: string | null;
  user?: EntityReference | null;
};

export type OrderItem = {
  productId: number | string;
  sku?: string | null;
  name?: string | null;
  quantity: number | string;
  unitPrice?: number | string | null;
};

export type Order = {
  id: number | string;
  version?: number;
  status?: OrderStatus;
  merchantId?: number | string;
  merchant?: EntityReference;
  customer?: EntityReference;
  courier?: CourierReference | null;
  fulfillmentType?: OrderFulfillmentType;
  address?: string | null;
  notes?: string | null;
  total?: number | string;
  currency?: string;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  history?: Array<Record<string, unknown>>;
};

export type OrderItemPayload = {
  productId: number;
  quantity: number;
};

export type OrderPayload = {
  merchantId: number | string;
  fulfillmentType?: OrderFulfillmentType;
  address?: string;
  currency?: string;
  notes?: string;
  items: OrderItemPayload[];
};

function buildQuery(query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  fallbackError: string
) {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await response.text();
  const parsed = text ? parseJsonSafely(text) : null;

  if (!response.ok) {
    throw new Error(extractErrorMessage(parsed ?? text, fallbackError));
  }

  if (!text) return {} as T;

  if (parsed === null) {
    throw new Error("El servicio respondió con un formato inesperado.");
  }

  return parsed as T;
}

function authHeaders(accessToken: string, idempotencyKey?: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

export async function listProductsForMerchant({
  accessToken,
  merchantId,
  type,
  q,
  available,
  limit = 30,
}: {
  accessToken: string;
  merchantId: number | string;
  type?: string;
  q?: string;
  available?: string;
  limit?: number;
}) {
  const url = `${serviceUrls.products}/products${buildQuery({
    merchantId,
    type,
    q,
    available,
    limit,
    expand: "merchant",
  })}`;

  return requestJson<ListResponse<Product>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar el catálogo."
  );
}

export async function createProductForMerchant({
  accessToken,
  merchantId,
  payload,
  idempotencyKey,
}: {
  accessToken: string;
  merchantId: number | string;
  payload: ProductPayload;
  idempotencyKey?: string;
}) {
  return requestJson<Product>(
    `${serviceUrls.products}/products`,
    {
      method: "POST",
      headers: authHeaders(accessToken, idempotencyKey),
      body: JSON.stringify({
        ...payload,
        merchantId,
        type: payload.type ?? "PRODUCT",
        currency: payload.currency ?? "PYG",
        available: payload.available ?? true,
      }),
    },
    "No se pudo crear el producto."
  );
}

export async function getProductForMerchant({
  accessToken,
  productId,
}: {
  accessToken: string;
  productId: number | string;
}) {
  return requestJson<Product>(
    `${serviceUrls.products}/products/${productId}`,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar el producto."
  );
}

export async function updateProductForMerchant({
  accessToken,
  productId,
  payload,
}: {
  accessToken: string;
  productId: number | string;
  payload: ProductPayload;
}) {
  const safePayload = { ...payload };
  delete safePayload.type;

  return requestJson<Product>(
    `${serviceUrls.products}/products/${productId}`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(safePayload),
    },
    "No se pudo actualizar el producto."
  );
}

export async function deleteProductForMerchant({
  accessToken,
  productId,
}: {
  accessToken: string;
  productId: number | string;
}) {
  await requestJson<unknown>(
    `${serviceUrls.products}/products/${productId}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
    "No se pudo eliminar el producto."
  );
}

export async function createOrderForMerchant({
  accessToken,
  payload,
  idempotencyKey,
}: {
  accessToken: string;
  payload: OrderPayload;
  idempotencyKey?: string;
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders`,
    {
      method: "POST",
      headers: authHeaders(accessToken, idempotencyKey),
      body: JSON.stringify({
        ...payload,
        fulfillmentType: payload.fulfillmentType ?? "DELIVERY",
        currency: payload.currency ?? "PYG",
      }),
    },
    "No se pudo crear el pedido."
  );
}

export async function listOrdersForMerchant({
  accessToken,
  status,
  limit = 30,
}: {
  accessToken: string;
  status?: string;
  limit?: number;
}) {
  const url = `${serviceUrls.orders}/orders${buildQuery({
    roleScope: "merchant",
    status,
    limit,
    expand: "customer,merchant,courier",
  })}`;

  return requestJson<ListResponse<Order>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar la lista de pedidos."
  );
}

export async function getOrderForMerchant({
  accessToken,
  orderId,
}: {
  accessToken: string;
  orderId: number | string;
}) {
  const url = `${serviceUrls.orders}/orders/${orderId}${buildQuery({
    expand: "customer,merchant,courier",
  })}`;

  return requestJson<Order>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar el pedido."
  );
}

export async function updateOrderItemsForMerchant({
  accessToken,
  orderId,
  payload,
}: {
  accessToken: string;
  orderId: number | string;
  payload: { items: OrderItemPayload[]; expectedVersion: number };
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders/${orderId}/items`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudieron actualizar los ítems del pedido."
  );
}

export async function updateOrderStatusForMerchant({
  accessToken,
  orderId,
  payload,
}: {
  accessToken: string;
  orderId: number | string;
  payload: { toStatus?: string; expectedVersion?: number };
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudo actualizar el estado del pedido."
  );
}

export async function deleteOrderForMerchant({
  accessToken,
  orderId,
}: {
  accessToken: string;
  orderId: number | string;
}) {
  await requestJson<unknown>(
    `${serviceUrls.orders}/orders/${orderId}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
    "No se pudo eliminar el pedido."
  );
}
