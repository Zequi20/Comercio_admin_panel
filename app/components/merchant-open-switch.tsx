"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type MerchantOpenSwitchProps = {
  initialIsOpen?: boolean | null;
  merchantId: number | string;
};

type MerchantResponse = {
  isOpen?: boolean | null;
  message?: string;
};

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function statusLabel(isOpen: boolean | null) {
  if (isOpen === true) return "Abierto";
  if (isOpen === false) return "Cerrado";
  return "Estado pendiente";
}

function statusClass(isOpen: boolean | null) {
  if (isOpen === true) return "success";
  if (isOpen === false) return "error";
  return "pending";
}

function statusHint(isOpen: boolean | null) {
  if (isOpen === true) return "Aceptando pedidos";
  if (isOpen === false) return "Pedidos pausados";
  return "Definí la disponibilidad";
}

export function MerchantOpenSwitch({
  initialIsOpen = null,
  merchantId,
}: MerchantOpenSwitchProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState<boolean | null>(initialIsOpen);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = isOpen === true;

  async function handleToggle() {
    const previousValue = isOpen;
    const nextValue = !checked;

    setIsSaving(true);
    setError(null);
    setIsOpen(nextValue);

    try {
      const response = await fetch(
        `/api/merchants/${encodeURIComponent(String(merchantId))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isOpen: nextValue }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | MerchantResponse
        | null;

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar el comercio.")
        );
      }

      setIsOpen(
        typeof payload?.isOpen === "boolean" ? payload.isOpen : nextValue
      );
      router.refresh();
    } catch (err) {
      setIsOpen(previousValue);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el comercio."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="merchant-open-control">
      <div className="merchant-open-copy" aria-live="polite">
        <span className={`pill ${statusClass(isOpen)}`}>
          {statusLabel(isOpen)}
        </span>
        <span className="merchant-open-hint">{statusHint(isOpen)}</span>
      </div>
      <button
        aria-checked={checked}
        aria-label={checked ? "Cerrar negocio" : "Abrir negocio"}
        className="merchant-switch"
        disabled={isSaving}
        onClick={handleToggle}
        role="switch"
        type="button"
      >
        <span className="merchant-switch-track">
          <span className="merchant-switch-thumb">
            {isSaving ? (
              <Loader2
                aria-hidden="true"
                className="merchant-switch-spinner"
                size={14}
              />
            ) : null}
          </span>
        </span>
      </button>
      {error ? (
        <p className="merchant-open-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
