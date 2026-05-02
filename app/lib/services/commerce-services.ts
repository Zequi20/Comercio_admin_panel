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

export type Order = {
  id: number | string;
  version?: number;
  status?: string;
  merchantId?: number | string;
  merchant?: { id?: number | string; name?: string | null };
  customer?: { id?: number | string; email?: string | null; nickname?: string | null };
  fulfillmentType?: "DELIVERY" | "PICKUP";
  address?: string | null;
  notes?: string | null;
  total?: number | string;
  currency?: string;
  items?: Array<Record<string, unknown>>;
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
