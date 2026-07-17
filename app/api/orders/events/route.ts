import { io, type Socket } from "socket.io-client";

import { decodeJwtPayload } from "@/app/lib/auth/access";
import { getCommerceRequestContextFromCookies } from "@/app/lib/auth/session";
import { ordersSocketConfig } from "@/app/lib/env";
import {
  listOrdersForMerchant,
  type Order,
} from "@/app/lib/services/commerce-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP_ALIVE_INTERVAL_MS = 15_000;
const RECONCILE_INTERVAL_MS = 30_000;
const MAX_STREAM_LIFETIME_MS = 15 * 60_000;
const ORDER_EVENTS = [
  "orders.updated",
  "order.created",
  "order.assigned",
  "order.updated",
  "order.price_confirmed",
  "order.items_updated",
] as const;

type RealtimeOrderPayload = {
  id?: number | string;
  updatedAt?: string;
  version?: number;
};

function readOrderIds(orders: Order[]) {
  return new Set(orders.map((order) => String(order.id)));
}

function ordersFingerprint(orders: Order[]) {
  return orders
    .map((order) =>
      [String(order.id), String(order.version ?? ""), order.updatedAt ?? ""].join(
        ":"
      )
    )
    .sort()
    .join("|");
}

function readPayloadOrderId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    return null;
  }

  const id = (payload as RealtimeOrderPayload).id;
  return id === null || id === undefined ? null : String(id);
}

function streamLifetime(accessToken: string) {
  const expiresAt = Number(decodeJwtPayload(accessToken)?.exp) * 1_000;

  if (!Number.isFinite(expiresAt)) {
    return MAX_STREAM_LIFETIME_MS;
  }

  return Math.min(
    MAX_STREAM_LIFETIME_MS,
    Math.max(1_000, expiresAt - Date.now() + 1_000)
  );
}

export async function GET(request: Request) {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    return Response.json(
      { message: "Tu sesión no permite escuchar cambios de órdenes." },
      { status: 401 }
    );
  }

  let initialOrders: Order[] = [];

  try {
    const response = await listOrdersForMerchant({
      accessToken: context.accessToken,
      limit: 100,
    });
    initialOrders = response.data ?? [];
  } catch {
    // El socket puede conectarse aunque la carga inicial falle temporalmente.
  }

  const encoder = new TextEncoder();
  let socket: Socket | null = null;
  let cleanupStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      let isReconciling = false;
      let orderIds = readOrderIds(initialOrders);
      let currentFingerprint = ordersFingerprint(initialOrders);

      const writeEvent = (event: string, data: Record<string, unknown>) => {
        if (isClosed) return;

        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cleanupStream();
        }
      };

      const joinOrder = (orderId: string) => {
        if (!socket?.connected) return;
        socket.emit("orders.join", { orderId });
      };

      const joinKnownOrders = () => {
        orderIds.forEach(joinOrder);
      };

      const bearerToken = `Bearer ${context.accessToken}`;
      socket = io(ordersSocketConfig.url, {
        path: ordersSocketConfig.path,
        transports: ["websocket"],
        auth: { token: bearerToken },
        extraHeaders: { Authorization: bearerToken },
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 8_000,
      });

      socket.on("connect", () => {
        joinKnownOrders();
        writeEvent("orders.connected", { connected: true });
      });

      socket.on("disconnect", () => {
        writeEvent("orders.connected", { connected: false });
      });

      socket.on("connect_error", (error) => {
        writeEvent("orders.connected", { connected: false });

        if (error instanceof Error && /unauthorized/i.test(error.message)) {
          setTimeout(() => cleanupStream(), 0);
        }
      });

      ORDER_EVENTS.forEach((eventName) => {
        socket?.on(eventName, (payload: unknown) => {
          const orderId = readPayloadOrderId(payload);

          if (orderId && !orderIds.has(orderId)) {
            orderIds.add(orderId);
            joinOrder(orderId);
          }

          const realtimePayload =
            payload && typeof payload === "object"
              ? (payload as RealtimeOrderPayload)
              : null;

          writeEvent("orders.changed", {
            source: "socket",
            event: eventName,
            orderId,
            version: realtimePayload?.version,
            updatedAt: realtimePayload?.updatedAt,
          });
        });
      });

      const reconcileOrders = async () => {
        if (isClosed || isReconciling) return;
        isReconciling = true;

        try {
          const response = await listOrdersForMerchant({
            accessToken: context.accessToken,
            limit: 100,
          });
          const nextOrders = response.data ?? [];
          const nextOrderIds = readOrderIds(nextOrders);
          const nextFingerprint = ordersFingerprint(nextOrders);
          const changed = nextFingerprint !== currentFingerprint;

          nextOrderIds.forEach((orderId) => {
            if (!orderIds.has(orderId)) {
              joinOrder(orderId);
            }
          });
          orderIds = nextOrderIds;
          currentFingerprint = nextFingerprint;

          if (changed) {
            writeEvent("orders.changed", { source: "reconciliation" });
          }
        } catch {
          // El socket sigue siendo la fuente principal si falla la reconciliación.
        } finally {
          isReconciling = false;
        }
      };

      const keepAliveInterval = setInterval(() => {
        if (isClosed) return;

        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          cleanupStream();
        }
      }, KEEP_ALIVE_INTERVAL_MS);
      const reconcileInterval = setInterval(
        () => void reconcileOrders(),
        RECONCILE_INTERVAL_MS
      );
      const streamLifetimeTimeout = setTimeout(
        () => cleanupStream(),
        streamLifetime(context.accessToken)
      );

      cleanupStream = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(keepAliveInterval);
        clearInterval(reconcileInterval);
        clearTimeout(streamLifetimeTimeout);
        request.signal.removeEventListener("abort", cleanupStream);
        socket?.removeAllListeners();
        socket?.disconnect();
        socket = null;

        try {
          controller.close();
        } catch {
          // El navegador puede haber cerrado el stream antes que el servidor.
        }
      };

      request.signal.addEventListener("abort", cleanupStream, { once: true });

      if (request.signal.aborted) {
        cleanupStream();
      }
    },
    cancel() {
      cleanupStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
