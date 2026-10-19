"use client";

import {
  CircleAlert,
  CircleCheck,
  RefreshCw,
  UserX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type DeletionRequestStatus = "PENDING" | "COMPLETED" | "REJECTED";

type DeletionRequest = {
  id: number;
  email: string;
  userId: number | null;
  reason: string | null;
  status: DeletionRequestStatus;
  resolvedAt: string | null;
  resolvedById: number | null;
  createdAt: string;
};

const STATUS_OPTIONS: Array<{ value: DeletionRequestStatus; label: string }> = [
  { value: "PENDING", label: "Pendientes" },
  { value: "COMPLETED", label: "Completadas" },
  { value: "REJECTED", label: "Rechazadas" },
];

const STATUS_PILLS: Record<DeletionRequestStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "pending" },
  COMPLETED: { label: "Completada", className: "success" },
  REJECTED: { label: "Rechazada", className: "error" },
};

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function readRequests(payload: unknown): DeletionRequest[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? (data as DeletionRequest[]) : [];
}

async function requestDeletionRequests(status: DeletionRequestStatus) {
  const response = await fetch(`/api/account-deletion-requests?status=${status}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      messageFromPayload(payload, "No se pudieron cargar las solicitudes de baja.")
    );
  }
  return readRequests(payload);
}

function loadErrorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "No se pudieron cargar las solicitudes de baja.";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function AccountDeletionRequestsManager() {
  const [status, setStatus] = useState<DeletionRequestStatus>("PENDING");
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRequests = useCallback(async (nextStatus: DeletionRequestStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      setRequests(await requestDeletionRequests(nextStatus));
    } catch (cause) {
      setRequests([]);
      setError(loadErrorMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void requestDeletionRequests(status)
      .then((nextRequests) => {
        if (isCurrent) setRequests(nextRequests);
      })
      .catch((cause: unknown) => {
        if (!isCurrent) return;
        setRequests([]);
        setError(loadErrorMessage(cause));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [status]);

  function changeStatus(nextStatus: DeletionRequestStatus) {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setStatus(nextStatus);
  }

  async function resolveRequest(
    request: DeletionRequest,
    resolution: Exclude<DeletionRequestStatus, "PENDING">
  ) {
    const confirmation =
      resolution === "COMPLETED"
        ? `¿Eliminar definitivamente la cuenta de ${request.email}? Se borran sus datos personales, se cierran sus sesiones y no se puede deshacer.`
        : `¿Rechazar la solicitud de ${request.email}? La cuenta queda como está.`;
    if (!window.confirm(confirmation)) return;

    setPendingRequestId(request.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/account-deletion-requests/${encodeURIComponent(String(request.id))}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: resolution }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo resolver la solicitud de baja.")
        );
      }

      const erasedUserId =
        payload && typeof payload === "object"
          ? (payload as { erasedUserId?: number | null }).erasedUserId
          : null;
      setSuccess(
        resolution === "REJECTED"
          ? `Solicitud de ${request.email} rechazada.`
          : erasedUserId
            ? `Cuenta #${erasedUserId} eliminada. Avisale a ${request.email} por correo.`
            : `Solicitud cerrada. No había una cuenta activa con ${request.email}.`
      );
      await loadRequests(status);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo resolver la solicitud de baja."
      );
    } finally {
      setPendingRequestId(null);
    }
  }

  const isPendingView = status === "PENDING";

  return (
    <div className="users-manager">
      {error ? (
        <div className="error-box catalog-status-message" role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="success-box catalog-status-message" role="status">
          <CircleCheck aria-hidden="true" size={18} />
          <span>{success}</span>
        </div>
      ) : null}

      <section className="card card-lg users-directory-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Solicitudes de baja</h2>
            <p className="muted">
              {isLoading ? "Cargando" : `${requests.length} solicitudes`} ·
              enviadas desde el formulario público de eliminación de cuenta
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              aria-label="Actualizar solicitudes"
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadRequests(status)}
              title="Actualizar solicitudes"
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={isLoading ? "spin-icon" : undefined}
                size={17}
              />
            </button>
          </div>
        </div>

        <div className="catalog-filters users-filters">
          <label className="field-group">
            <span className="field-label">Estado</span>
            <select
              className="field-control"
              onChange={(event) =>
                changeStatus(event.target.value as DeletionRequestStatus)
              }
              value={status}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isPendingView ? (
          <div className="notification-info-box" role="note">
            <CircleAlert aria-hidden="true" size={16} />
            <span>
              Completar una solicitud borra el correo, el nombre y el teléfono de la cuenta,
              la desactiva y cierra sus sesiones. Los pedidos se conservan sin datos personales.
            </span>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data-table users-data-table">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Cuenta</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>{isPendingView ? "Recibida" : "Resuelta"}</th>
                {isPendingView ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={isPendingView ? 6 : 5}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : requests.length ? (
                requests.map((request) => {
                  const pill = STATUS_PILLS[request.status];
                  const isPending = pendingRequestId === request.id;

                  return (
                    <tr key={request.id}>
                      <td>
                        <strong>{request.email}</strong>
                        <span className="table-muted">Solicitud #{request.id}</span>
                      </td>
                      <td>
                        {request.userId ? (
                          <strong>Usuario #{request.userId}</strong>
                        ) : (
                          <span className="table-muted">
                            Sin cuenta activa con ese correo
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="table-muted order-description-cell"
                          title={request.reason ?? undefined}
                        >
                          {request.reason || "Sin motivo"}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${pill.className}`}>{pill.label}</span>
                      </td>
                      <td>
                        {formatDate(isPendingView ? request.createdAt : request.resolvedAt)}
                        {!isPendingView && request.resolvedById ? (
                          <span className="table-muted">
                            Por usuario #{request.resolvedById}
                          </span>
                        ) : null}
                      </td>
                      {isPendingView ? (
                        <td>
                          <div className="table-actions">
                            <button
                              aria-label={`Completar la baja de ${request.email}`}
                              className="icon-button danger-button"
                              disabled={isPending}
                              onClick={() => void resolveRequest(request, "COMPLETED")}
                              title="Completar baja y eliminar la cuenta"
                              type="button"
                            >
                              {isPending ? (
                                <span aria-hidden="true" className="spinner" />
                              ) : (
                                <UserX aria-hidden="true" size={16} />
                              )}
                            </button>
                            <button
                              aria-label={`Rechazar la solicitud de ${request.email}`}
                              className="icon-button"
                              disabled={isPending}
                              onClick={() => void resolveRequest(request, "REJECTED")}
                              title="Rechazar solicitud"
                              type="button"
                            >
                              <X aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={isPendingView ? 6 : 5}>
                    <div className="empty-table-state">
                      <UserX aria-hidden="true" size={26} />
                      <strong>
                        {isPendingView
                          ? "No hay solicitudes pendientes"
                          : "Sin solicitudes en este estado"}
                      </strong>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
