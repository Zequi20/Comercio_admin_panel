import "server-only";

function normalizeApiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

function readServiceUrl({
  primary,
  aliases,
  fallback,
}: {
  primary: string;
  aliases: string[];
  fallback: string;
}) {
  const value =
    process.env[primary] ??
    aliases.map((key) => process.env[key]).find((item) => item?.trim()) ??
    fallback;

  return normalizeApiBaseUrl(value);
}

export const serviceUrls = {
  auth: readServiceUrl({
    primary: "AUTH",
    aliases: ["AUTH_BASE_URL", "NEXT_PUBLIC_AUTH_BASE_URL"],
    fallback: "http://localhost:3001/api/v1",
  }),
  orders: readServiceUrl({
    primary: "ORDERS",
    aliases: ["ORDERS_BASE_URL", "NEXT_PUBLIC_ORDERS_BASE_URL"],
    fallback: "http://localhost:3002/api/v1",
  }),
  products: readServiceUrl({
    primary: "PRODUCTS",
    aliases: ["PRODUCTS_BASE_URL", "NEXT_PUBLIC_PRODUCTS_BASE_URL"],
    fallback: "http://localhost:3004/api/v1",
  }),
  notify: readServiceUrl({
    primary: "NOTIFY",
    aliases: ["NOTIFY_BASE_URL", "NEXT_PUBLIC_NOTIFY_BASE_URL"],
    fallback: "http://localhost:3003/api/v1",
  }),
};

function readOrdersSocketUrl() {
  const configuredUrl = process.env.ORDERS_SOCKET_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return new URL(serviceUrls.orders).origin;
}

export const ordersSocketConfig = {
  url: readOrdersSocketUrl(),
  path: process.env.ORDERS_SOCKET_PATH?.trim() || "/ws",
};
