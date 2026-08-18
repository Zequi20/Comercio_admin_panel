import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  badRequestResponse,
  serviceErrorResponse,
  unauthorizedCommerceResponse,
} from "@/app/lib/api/responses";
import { getScopedCommerceRequestContextFromCookies } from "@/app/lib/auth/portal-scope";
import {
  createCustomOrder,
  type CustomOrderPayload,
} from "@/app/lib/services/commerce-services";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coordinate(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null;
}

function customOrderPayload(value: unknown): CustomOrderPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  const origin =
    body.origin && typeof body.origin === "object" && !Array.isArray(body.origin)
      ? (body.origin as Record<string, unknown>)
      : null;
  const destination =
    body.destination &&
    typeof body.destination === "object" &&
    !Array.isArray(body.destination)
      ? (body.destination as Record<string, unknown>)
      : null;

  if (!origin || !destination) return null;

  const originLabel = text(origin.label);
  const productDescription = text(body.productDescription);
  const contactPhone = text(body.contactPhone);
  const originLatitude = coordinate(origin.latitude, -90, 90);
  const originLongitude = coordinate(origin.longitude, -180, 180);
  const destinationLatitude = coordinate(destination.latitude, -90, 90);
  const destinationLongitude = coordinate(destination.longitude, -180, 180);

  if (
    !originLabel ||
    !productDescription ||
    contactPhone.length < 6 ||
    originLatitude === null ||
    originLongitude === null ||
    destinationLatitude === null ||
    destinationLongitude === null
  ) {
    return null;
  }

  const originAddress = text(origin.address);
  const destinationAddress = text(destination.address);
  const notes = text(body.notes);
  const currency = text(body.currency).toUpperCase();

  return {
    origin: {
      label: originLabel,
      latitude: originLatitude,
      longitude: originLongitude,
      ...(originAddress ? { address: originAddress } : {}),
    },
    productDescription,
    destination: {
      latitude: destinationLatitude,
      longitude: destinationLongitude,
      ...(destinationAddress ? { address: destinationAddress } : {}),
    },
    contactPhone,
    ...(notes ? { notes } : {}),
    currency: currency.length === 3 ? currency : "PYG",
  };
}

export async function POST(request: Request) {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) return unauthorizedCommerceResponse();
  if (!context.isAdmin) {
    return NextResponse.json(
      { message: "Sólo un administrador puede crear pedidos custom aquí." },
      { status: 403 }
    );
  }

  const payload = customOrderPayload(await request.json().catch(() => null));
  if (!payload) {
    return badRequestResponse(
      "Completá origen, descripción, destino, coordenadas y teléfono."
    );
  }

  try {
    const order = await createCustomOrder({
      accessToken: context.accessToken,
      payload,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? randomUUID(),
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, "No se pudo crear el pedido custom.");
  }
}
