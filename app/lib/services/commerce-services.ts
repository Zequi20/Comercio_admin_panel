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

export type ProductImportError = {
  row?: number | string;
  sku?: string;
  message?: string;
  [key: string]: unknown;
};

export type ProductImportResponse = {
  processed: number;
  created: number;
  failed: number;
  errors: ProductImportError[];
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

export type Courier = {
  id: number | string;
  name?: string | null;
  user?: EntityReference | null;
  isActive: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CourierPayload = {
  userId?: number;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CourierUserPayload = {
  email: string;
  password: string;
  nickname?: string | null;
  phone?: string | null;
};

export type CourierUserCreateResponse = {
  user?: EntityReference;
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

export type OrderAssignmentPayload = {
  courierId: number;
  expectedVersion: number;
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

async function requestFormDataJson<T>(
  input: string,
  init: RequestInit,
  fallbackError: string
) {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
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

export async function importProductsForMerchant({
  accessToken,
  formData,
}: {
  accessToken: string;
  formData: FormData;
}) {
  return requestFormDataJson<ProductImportResponse>(
    `${serviceUrls.products}/products/import`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: formData,
    },
    "No se pudo importar el archivo."
  );
}

export async function listCouriersForMerchant({
  accessToken,
  limit = 100,
}: {
  accessToken: string;
  limit?: number;
}) {
  const url = `${serviceUrls.auth}/couriers${buildQuery({
    limit,
    expand: "user",
  })}`;

  return requestJson<ListResponse<Courier>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar la lista de repartidores."
  );
}

export async function createCourierUser({
  payload,
}: {
  payload: CourierUserPayload;
}) {
  return requestJson<CourierUserCreateResponse>(
    `${serviceUrls.auth}/auth/register`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        role: "COURIER",
      }),
    },
    "No se pudo crear el usuario repartidor."
  );
}

export async function createCourierForMerchant({
  accessToken,
  payload,
}: {
  accessToken: string;
  payload: CourierPayload & { userId: number };
}) {
  return requestJson<Courier>(
    `${serviceUrls.auth}/couriers`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudo crear el repartidor."
  );
}

export async function getCourierForMerchant({
  accessToken,
  courierId,
}: {
  accessToken: string;
  courierId: number | string;
}) {
  const url = `${serviceUrls.auth}/couriers/${courierId}${buildQuery({
    expand: "user",
  })}`;

  return requestJson<Courier>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar el repartidor."
  );
}

export async function updateCourierForMerchant({
  accessToken,
  courierId,
  payload,
}: {
  accessToken: string;
  courierId: number | string;
  payload: Omit<CourierPayload, "userId">;
}) {
  return requestJson<Courier>(
    `${serviceUrls.auth}/couriers/${courierId}`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudo actualizar el repartidor."
  );
}

export async function deleteCourierForMerchant({
  accessToken,
  courierId,
}: {
  accessToken: string;
  courierId: number | string;
}) {
  await requestJson<unknown>(
    `${serviceUrls.auth}/couriers/${courierId}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
    "No se pudo eliminar el repartidor."
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
    expand: "customer,courier",
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
    expand: "customer,courier",
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

export async function assignOrderCourierForMerchant({
  accessToken,
  orderId,
  payload,
}: {
  accessToken: string;
  orderId: number | string;
  payload: OrderAssignmentPayload;
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders/${orderId}/assign`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudo asignar el repartidor."
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
