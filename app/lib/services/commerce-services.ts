import "server-only";

import { serviceUrls } from "../env";
import { orderBelongsToMerchant } from "../orders/order-merchant";
import { extractErrorMessage, parseJsonSafely } from "../problem-details";

export type ListResponse<T> = {
  data: T[];
  cursor?: number | string | null;
};

export type ProductType = "PRODUCT" | "SERVICE";
export type ProductAvailabilityStatus =
  | "AVAILABLE"
  | "PAUSED"
  | "OUT_OF_STOCK"
  | "INACTIVE";

export type Product = {
  id: number | string;
  merchantId: number | string;
  merchant?: EntityReference;
  type?: ProductType;
  sku?: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency: string;
  available: boolean;
  availabilityStatus: ProductAvailabilityStatus;
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
  availabilityStatus?: ProductAvailabilityStatus;
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
  merchant?: EntityReference | null;
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
  merchantId?: number | string;
};

export type CourierUserCreateResponse = {
  user?: EntityReference;
};

export type NotificationDirectoryRole =
  | "ADMIN"
  | "MERCHANT"
  | "COURIER"
  | "CUSTOMER";

export type NotificationDirectoryUser = {
  id: number;
  email: string;
  nickname?: string | null;
  phone?: string | null;
  isActive: boolean;
  roles: NotificationDirectoryRole[];
  merchant?: EntityReference | null;
  courier?: CourierReference | null;
};

export type NotificationDirectoryResponse = {
  data: NotificationDirectoryUser[];
  truncated: boolean;
};

export type ManualNotificationResult = {
  status: "queued" | "partial" | "failed";
  attempted: number;
  queued: number;
  failed: number;
  failedUserIds: number[];
};

export type OrderItem = {
  productId: number | string;
  sku?: string | null;
  name?: string | null;
  quantity: number | string;
  unitPrice?: number | string | null;
};

export type CustomOrderLocation = {
  label?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
};

export type CustomOrderRequest = {
  origin: CustomOrderLocation & { label: string };
  productDescription: string;
  destination: CustomOrderLocation;
  contactPhone: string;
};

export type Order = {
  id: number | string;
  version?: number;
  status?: OrderStatus;
  orderType?: "CATALOG" | "CUSTOM";
  merchantId?: number | string;
  merchant?: EntityReference;
  customer?: EntityReference;
  courier?: CourierReference | null;
  fulfillmentType?: OrderFulfillmentType;
  address?: string | null;
  notes?: string | null;
  customRequest?: CustomOrderRequest | null;
  estimatedDeliveryCost?: number | string | null;
  priceStatus?: "PENDING" | "CONFIRMED";
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

export type CustomOrderPayload = CustomOrderRequest & {
  notes?: string;
  currency?: string;
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
  cursor,
  merchantId,
  type,
  q,
  available,
  availabilityStatus,
  limit = 30,
}: {
  accessToken: string;
  cursor?: number | string;
  merchantId?: number | string;
  type?: string;
  q?: string;
  available?: string;
  availabilityStatus?: string;
  limit?: number;
}) {
  const url = `${serviceUrls.products}/products${buildQuery({
    merchantId,
    cursor,
    type,
    q,
    available,
    availabilityStatus,
    limit,
    expand: "merchant",
  })}`;

  return requestJson<ListResponse<Product>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar el catálogo."
  );
}

export async function listProductsForAdminScope({
  accessToken,
  merchantId,
  type,
  q,
  available,
  availabilityStatus,
}: {
  accessToken: string;
  merchantId?: number | string;
  type?: string;
  q?: string;
  available?: string;
  availabilityStatus?: string;
}) {
  const pageSize = 100;
  const maxProducts = 2_000;
  const products: Product[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;
  let truncated = false;

  while (products.length < maxProducts) {
    const response = await listProductsForMerchant({
      accessToken,
      merchantId,
      type,
      q,
      available,
      availabilityStatus,
      cursor,
      limit: pageSize,
    });

    for (const product of response.data ?? []) {
      const id = String(product.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      products.push(product);
    }

    const nextCursor = response.cursor;
    const cursorKey = nextCursor === null || nextCursor === undefined
      ? ""
      : String(nextCursor);

    if (
      (response.data?.length ?? 0) < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    if (products.length >= maxProducts) {
      truncated = true;
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  return { data: products, cursor: null, truncated };
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
  cursor,
  limit = 100,
}: {
  accessToken: string;
  cursor?: number | string;
  limit?: number;
}) {
  const url = `${serviceUrls.auth}/couriers${buildQuery({
    limit,
    cursor,
    expand: "user",
  })}`;

  return requestJson<ListResponse<Courier>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar la lista de repartidores."
  );
}

export async function listCouriersForAdminScope({
  accessToken,
  merchantId,
}: {
  accessToken: string;
  merchantId?: number | string;
}) {
  const pageSize = 100;
  const maxCouriers = 2_000;
  const couriers: Courier[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;
  let truncated = false;

  while (couriers.length < maxCouriers) {
    const response = await listCouriersForMerchant({
      accessToken,
      cursor,
      limit: pageSize,
    });

    for (const courier of response.data ?? []) {
      const id = String(courier.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      couriers.push(courier);
    }

    const nextCursor = response.cursor;
    const cursorKey = nextCursor === null || nextCursor === undefined
      ? ""
      : String(nextCursor);

    if (
      (response.data?.length ?? 0) < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    if (couriers.length >= maxCouriers) {
      truncated = true;
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  const directory = await listNotificationUsers({ accessToken });
  const usersByCourierId = new Map<string, NotificationDirectoryUser>();

  for (const user of directory.data) {
    if (user.courier?.id !== undefined) {
      usersByCourierId.set(String(user.courier.id), user);
    }
  }

  const enrichedCouriers = couriers.map((courier) => {
    const directoryUser = usersByCourierId.get(String(courier.id));
    return {
      ...courier,
      merchant: directoryUser?.merchant ?? null,
    };
  });

  return {
    cursor: null,
    truncated: truncated || directory.truncated,
    data: merchantId
      ? enrichedCouriers.filter(
          (courier) => String(courier.merchant?.id ?? "") === String(merchantId)
        )
      : enrichedCouriers,
  };
}

export async function listNotificationUsers({
  accessToken,
}: {
  accessToken: string;
}): Promise<NotificationDirectoryResponse> {
  const pageSize = 100;
  const maxUsers = 2_000;
  const users: NotificationDirectoryUser[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;
  let truncated = false;

  while (users.length < maxUsers) {
    const response = await requestJson<ListResponse<NotificationDirectoryUser>>(
      `${serviceUrls.auth}/users${buildQuery({
        limit: pageSize,
        cursor,
        expand: "merchant,courier",
      })}`,
      { method: "GET", headers: authHeaders(accessToken) },
      "No se pudo cargar el directorio de usuarios."
    );

    for (const user of response.data ?? []) {
      const userId = Number(user.id);
      if (!Number.isSafeInteger(userId) || userId <= 0 || seenIds.has(userId)) {
        continue;
      }

      seenIds.add(userId);
      users.push({ ...user, id: userId });
    }

    const nextCursor = response.cursor;
    const cursorKey = nextCursor === null || nextCursor === undefined
      ? ""
      : String(nextCursor);

    if (
      (response.data?.length ?? 0) < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    if (users.length >= maxUsers) {
      truncated = true;
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  return { data: users.slice(0, maxUsers), truncated };
}

export async function sendManualNotifications({
  accessToken,
  userIds,
  title,
  body,
  data,
}: {
  accessToken: string;
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<ManualNotificationResult> {
  const failedUserIds: number[] = [];
  let queued = 0;
  let nextIndex = 0;
  const concurrency = Math.min(8, userIds.length);

  async function worker() {
    while (nextIndex < userIds.length) {
      const userId = userIds[nextIndex];
      nextIndex += 1;

      try {
        await requestJson<{ status?: string }>(
          `${serviceUrls.notify}/notify/test`,
          {
            method: "POST",
            headers: authHeaders(accessToken),
            body: JSON.stringify({ userId, title, body, ...(data ? { data } : {}) }),
          },
          `No se pudo encolar la notificación para el usuario #${userId}.`
        );
        queued += 1;
      } catch {
        failedUserIds.push(userId);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const failed = failedUserIds.length;
  return {
    status: failed === 0 ? "queued" : queued === 0 ? "failed" : "partial",
    attempted: userIds.length,
    queued,
    failed,
    failedUserIds,
  };
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

export async function createCustomOrder({
  accessToken,
  payload,
  idempotencyKey,
}: {
  accessToken: string;
  payload: CustomOrderPayload;
  idempotencyKey?: string;
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders/custom`,
    {
      method: "POST",
      headers: authHeaders(accessToken, idempotencyKey),
      body: JSON.stringify(payload),
    },
    "No se pudo crear el pedido custom."
  );
}

export async function listOrdersForMerchant({
  accessToken,
  cursor,
  roleScope = "merchant",
  status,
  limit = 30,
}: {
  accessToken: string;
  cursor?: number | string;
  roleScope?: "merchant" | "admin";
  status?: string;
  limit?: number;
}) {
  const url = `${serviceUrls.orders}/orders${buildQuery({
    roleScope,
    status,
    limit,
    cursor,
    expand: "customer,merchant,courier",
  })}`;

  return requestJson<ListResponse<Order>>(
    url,
    { method: "GET", headers: authHeaders(accessToken) },
    "No se pudo cargar la lista de pedidos."
  );
}

export async function listOrdersForAdminScope({
  accessToken,
  merchantId,
  status,
}: {
  accessToken: string;
  merchantId?: number | string;
  status?: string;
}) {
  const pageSize = 100;
  const maxOrders = 2_000;
  const orders: Order[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: number | string | undefined;
  let truncated = false;

  while (orders.length < maxOrders) {
    const response = await listOrdersForMerchant({
      accessToken,
      cursor,
      roleScope: "admin",
      status,
      limit: pageSize,
    });

    for (const order of response.data ?? []) {
      const id = String(order.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      orders.push(order);
    }

    const nextCursor = response.cursor;
    const cursorKey = nextCursor === null || nextCursor === undefined
      ? ""
      : String(nextCursor);

    if (
      (response.data?.length ?? 0) < pageSize ||
      !cursorKey ||
      seenCursors.has(cursorKey)
    ) {
      break;
    }

    if (orders.length >= maxOrders) {
      truncated = true;
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor ?? undefined;
  }

  return {
    data: merchantId
      ? orders.filter((order) => orderBelongsToMerchant(order, merchantId))
      : orders,
    cursor: null,
    truncated,
  };
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

export async function confirmCustomOrderPrice({
  accessToken,
  orderId,
  payload,
}: {
  accessToken: string;
  orderId: number | string;
  payload: { total: number; expectedVersion: number };
}) {
  return requestJson<Order>(
    `${serviceUrls.orders}/orders/${orderId}/price`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
    "No se pudo confirmar el precio final."
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
