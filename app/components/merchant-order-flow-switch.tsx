"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type MerchantOrderFlowSwitchProps = {
  initialAutoConfirmOrders?: boolean | null;
  merchantId: number | string;
};

type MerchantResponse = {
  autoConfirmOrders?: boolean | null;
  message?: string;
};

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

export function MerchantOrderFlowSwitch({
  initialAutoConfirmOrders = false,
  merchantId,
}: MerchantOrderFlowSwitchProps) {
  const router = useRouter();
  const [autoConfirmOrders, setAutoConfirmOrders] = useState(
    initialAutoConfirmOrders === true,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const previousValue = autoConfirmOrders;
    const nextValue = !previousValue;

    setIsSaving(true);
    setError(null);
    setAutoConfirmOrders(nextValue);

    try {
      const response = await fetch(
        `/api/merchants/${encodeURIComponent(String(merchantId))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ autoConfirmOrders: nextValue }),
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as MerchantResponse | null;

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            payload,
            "No se pudo actualizar el flujo de pedidos.",
          ),
        );
      }

      setAutoConfirmOrders(
        typeof payload?.autoConfirmOrders === "boolean"
          ? payload.autoConfirmOrders
          : nextValue,
      );
      router.refresh();
    } catch (cause) {
      setAutoConfirmOrders(previousValue);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el flujo de pedidos.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="merchant-open-control">
      <div className="merchant-open-copy" aria-live="polite">
        <span
          className={`pill ${autoConfirmOrders ? "assigned" : "confirmed"}`}
        >
          {autoConfirmOrders ? "Flujo automático" : "Preparación manual"}
        </span>
        <span className="merchant-open-hint">
          {autoConfirmOrders
            ? "Confirma pedidos delivery y activa la búsqueda secuencial de repartidor."
            : "Al confirmar el pedido, comienza la búsqueda automática hasta que un repartidor acepte."}
        </span>
      </div>
      <button
        aria-checked={autoConfirmOrders}
        aria-label={
          autoConfirmOrders
            ? "Usar confirmación manual de pedidos"
            : "Activar confirmación automática de pedidos"
        }
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
