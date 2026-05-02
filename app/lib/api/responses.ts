import { NextResponse } from "next/server";

export function unauthorizedCommerceResponse() {
  return NextResponse.json(
    {
      message:
        "Tu sesión no tiene un comercio asociado o no puede gestionar este portal.",
    },
    { status: 401 }
  );
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export function serviceErrorResponse(error: unknown, fallback: string) {
  return NextResponse.json(
    { message: error instanceof Error ? error.message : fallback },
    { status: 502 }
  );
}
