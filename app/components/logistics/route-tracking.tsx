"use client";

import { Download, History, Lock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatDateTime,
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
  ROUTE_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
  statusPillClass,
} from "@/app/lib/logistics/client";
import type {
  AuditEntry,
  LogisticsContract,
  LogisticsRoute,
  RouteSettlement,
  SettlementSnapshot,
  Shipment,
  ShipmentStatus,
} from "@/app/lib/logistics/types";

const REFRESH_MS = 30_000;

const ACTION_LABEL: Record<string, string> = {
  SHIPMENT_CREATED: "Guía importada",
  SHIPMENT_RECEIVED: "Paquete recibido",
  SHIPMENT_MISSING: "Marcado como faltante",
  ATTEMPT_DELIVERED: "Entregado",
  ATTEMPT_FAILED: "No entregado",
  COLLECTION_RECORDED: "Cobro registrado",
  COLLECTION_VOIDED: "Cobro anulado",
  SHIPMENT_RETURN_PENDING: "Pasa a devolver",
};

type CourierOption = { id: number | string; name?: string | null; user?: { email?: string } | null };

function ShipmentHistory({ shipment, reasons }: { shipment: Shipment; reasons: Map<string, string> }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await logisticsFetch<{ data: AuditEntry[] }>(`shipments/${shipment.id}/history`);
      setEntries(result.ok ? result.data.data : []);
    })();
  }, [shipment.id]);

  return (
    <div className="logistics-history">
      {shipment.attempts.length > 0 ? (
        <ul>
          {shipment.attempts.map((attempt) => (
            <li key={attempt.id}>
              {formatDateTime(attempt.occurredAt)} · {attempt.result === "DELIVERED" ? "Entregado" : "No entregado"}
              {attempt.reason ? ` · ${reasons.get(attempt.reason) ?? attempt.reason}` : ""}
              {attempt.note ? ` · “${attempt.note}”` : ""} · usuario #{attempt.actorUserId}
            </li>
          ))}
        </ul>
      ) : null}
      {shipment.collections.length > 0 ? (
        <ul>
          {shipment.collections.map((collection) => (
            <li key={collection.id} className={collection.status === "VOIDED" ? "table-muted" : undefined}>
              {formatDateTime(collection.occurredAt)} · Cobro {formatGs(collection.amount)}
              {collection.status === "VOIDED" ? ` · anulado (${collection.voidReason ?? "sin motivo"})` : ""}
              {collection.note ? ` · “${collection.note}”` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {entries === null ? (
        <p className="table-muted">Cargando historial…</p>
      ) : (
        <ul className="table-muted">
          {entries.map((entry) => (
            <li key={entry.id}>
              {formatDateTime(entry.createdAt)} · {ACTION_LABEL[entry.action] ?? entry.action} ·{" "}
              {entry.actorRole === "ADMIN" ? "admin" : "repartidor"} #{entry.actorUserId}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettlementCard({ routeId, snapshot, closed }: { routeId: number; snapshot: SettlementSnapshot; closed: boolean }) {
  return (
    <section className="card card-lg">
      <div className="card-header">
        <div>
          <h2 className="card-title">{closed ? "Rendición" : "Rendición parcial (recorrido abierto)"}</h2>
          <p className="muted">
            Esperado = importe de las guías entregadas. Cobrado = cobros registrados y no anulados.
          </p>
        </div>
        {closed ? (
          <div className="table-actions">
            <a className="button-primary" href={`/api/logistics/routes/${routeId}/export?format=xlsx`}>
              <Download size={16} /> Excel
            </a>
            <a className="button-secondary" href={`/api/logistics/routes/${routeId}/export?format=csv`}>
              <Download size={16} /> CSV
            </a>
          </div>
        ) : null}
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Esperado</span>
          <strong className="stat-value">{formatGs(snapshot.expectedAmount)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cobrado</span>
          <strong className="stat-value">{formatGs(snapshot.collectedAmount)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Diferencia</span>
          <strong className="stat-value">{formatGs(snapshot.differenceAmount)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Entregadas / a devolver / faltantes</span>
          <strong className="stat-value">
            {snapshot.counts.delivered} / {snapshot.counts.returnPending} / {snapshot.counts.missing}
          </strong>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Remitente</th>
              <th>Entregadas</th>
              <th>A devolver</th>
              <th>Faltantes</th>
              <th>Esperado</th>
              <th>Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.bySender.map((sender) => (
              <tr key={sender.senderName}>
                <td>{sender.senderName}</td>
                <td>{sender.delivered}</td>
                <td>{sender.returnPending}</td>
                <td>{sender.missing}</td>
                <td>{formatGs(sender.expectedAmount)}</td>
                <td>{formatGs(sender.collectedAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RouteTracking({ routeId }: { routeId: number }) {
  const [route, setRoute] = useState<LogisticsRoute | null>(null);
  const [snapshot, setSnapshot] = useState<SettlementSnapshot | null>(null);
  const [reasons, setReasons] = useState(new Map<string, string>());
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "PENDING" | "">("");
  const [openShipment, setOpenShipment] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const result = await logisticsFetch<LogisticsRoute>(`routes/${routeId}`);
    if (!result.ok) {
      setError(problemMessage(result.problem, "No se pudo cargar el recorrido."));
      return;
    }
    setRoute(result.data);
    setUpdatedAt(new Date());
    const settlement = result.data.hasSettlement
      ? await logisticsFetch<RouteSettlement>(`routes/${routeId}/settlement`)
      : await logisticsFetch<SettlementSnapshot>(`routes/${routeId}/settlement/preview`);
    if (settlement.ok) {
      setSnapshot("snapshot" in settlement.data ? settlement.data.snapshot : settlement.data);
    }
  }, [routeId]);

  useEffect(() => {
    async function loadInitialRoute() {
      await load();
    }

    void loadInitialRoute();
    void (async () => {
      const contract = await logisticsFetch<LogisticsContract>("contract");
      if (contract.ok) {
        setReasons(new Map(contract.data.failureReasons.map((reason) => [reason.code, reason.label])));
      }
      const response = await fetch("/api/couriers", { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { data?: CourierOption[] } | null;
      setCouriers(body?.data ?? []);
    })();
  }, [load]);

  useEffect(() => {
    if (!route || route.status === "CLOSED") return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [route, load]);

  const shipments = useMemo(() => {
    const all = (route?.stops ?? []).flatMap((stop) =>
      stop.shipments.map((shipment) => ({ stop, shipment }))
    );
    if (!statusFilter) return all;
    if (statusFilter === "PENDING") {
      return all.filter(({ shipment }) => ["PENDING_RECEIPT", "RECEIVED", "FAILED"].includes(shipment.status));
    }
    return all.filter(({ shipment }) => shipment.status === statusFilter);
  }, [route, statusFilter]);

  const reassign = async (courierId: string) => {
    if (!route || !courierId) return;
    setBusy(true);
    const result = await logisticsFetch<LogisticsRoute>(`routes/${routeId}`, {
      method: "PATCH",
      body: { courierId: Number(courierId), expectedVersion: route.version },
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    if (result.ok) setRoute(result.data);
    else setError(problemMessage(result.problem, "No se pudo cambiar el repartidor."));
  };

  const close = async () => {
    if (!window.confirm("¿Cerrar el recorrido? Lo no entregado pasa a devolver y la rendición queda fija.")) return;
    setBusy(true);
    const result = await logisticsFetch<RouteSettlement>(`routes/${routeId}/close`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    if (result.ok) void load();
    else setError(problemMessage(result.problem, "No se pudo cerrar el recorrido."));
  };

  if (!route) {
    return error ? <div className="error-box">{error}</div> : <div className="skeleton table-skeleton" />;
  }

  const byStatus = route.summary.byStatus;

  return (
    <div className="logistics-layout">
      <section className="card card-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Recorrido #{route.id} · {route.carrier.name} · planilla {route.import.sheetNumber}
            </h2>
            <p className="muted">
              Fecha {route.businessDate} · repartidor #{route.courierId} ·{" "}
              {route.receivedAt ? `recibido ${formatDateTime(route.receivedAt)}` : "sin confirmar recepción"}
              {route.closedAt ? ` · cerrado ${formatDateTime(route.closedAt)}` : ""}
            </p>
          </div>
          <div className="table-actions">
            <span className={statusPillClass(route.status)}>{ROUTE_STATUS_LABEL[route.status]}</span>
            <button className="icon-button" type="button" onClick={() => void load()} aria-label="Actualizar">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Pendientes</span>
            <strong className="stat-value">{route.summary.pending}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Entregadas</span>
            <strong className="stat-value">{byStatus.DELIVERED}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">No entregadas / a devolver</span>
            <strong className="stat-value">{byStatus.FAILED + byStatus.RETURN_PENDING}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Faltantes</span>
            <strong className="stat-value">{byStatus.MISSING}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Cobrado</span>
            <strong className="stat-value">{formatGs(route.summary.collectedAmount)}</strong>
          </div>
        </div>
        {route.status === "ASSIGNED" ? (
          <label className="field-group">
            <span className="field-label">Cambiar repartidor (antes de que reciba los paquetes)</span>
            <select
              className="field-control"
              value=""
              disabled={busy}
              onChange={(event) => void reassign(event.target.value)}
            >
              <option value="">Elegí otro repartidor</option>
              {couriers
                .filter((courier) => Number(courier.id) !== route.courierId)
                .map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name || courier.user?.email || `Repartidor #${courier.id}`}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {route.status === "IN_PROGRESS" ? (
          <div className="form-actions">
            <button className="button-secondary" type="button" disabled={busy} onClick={close}>
              <Lock size={16} /> Cerrar recorrido
            </button>
          </div>
        ) : null}
        {error ? <div className="error-box">{error}</div> : null}
        {updatedAt && route.status !== "CLOSED" ? (
          <p className="field-help">Se actualiza cada 30 segundos. Última lectura: {formatDateTime(updatedAt.toISOString())}.</p>
        ) : null}
      </section>

      {snapshot ? <SettlementCard routeId={route.id} snapshot={snapshot} closed={route.status === "CLOSED"} /> : null}

      <section className="card card-lg">
        <div className="card-header">
          <h2 className="card-title">Guías por parada</h2>
          <label className="field-group">
            <span className="field-label">Mostrar</span>
            <select
              className="field-control"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ShipmentStatus | "PENDING" | "")}
            >
              <option value="">Todas</option>
              <option value="PENDING">Pendientes</option>
              {Object.entries(SHIPMENT_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parada</th>
                <th>Guía</th>
                <th>Remitente</th>
                <th>Destinatario</th>
                <th>Dirección</th>
                <th>Bultos</th>
                <th>A cobrar</th>
                <th>Cobrado</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shipments.map(({ stop, shipment }) => (
                <FragmentRow
                  key={shipment.id}
                  stopSequence={stop.sequence}
                  shipment={shipment}
                  reasons={reasons}
                  open={openShipment === shipment.id}
                  onToggle={() => setOpenShipment(openShipment === shipment.id ? null : shipment.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FragmentRow({
  stopSequence,
  shipment,
  reasons,
  open,
  onToggle,
}: {
  stopSequence: number;
  shipment: Shipment;
  reasons: Map<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const reason = shipment.lastAttempt?.result === "FAILED" ? shipment.lastAttempt.reason : null;
  return (
    <>
      <tr>
        <td>{stopSequence}</td>
        <td>{shipment.trackingNumber}</td>
        <td>{shipment.senderName ?? "—"}</td>
        <td>{shipment.recipientName ?? "—"}</td>
        <td className="logistics-address-cell">{shipment.addressText ?? "—"}</td>
        <td>{shipment.packages}</td>
        <td>{formatGs(shipment.amountToCollect)}</td>
        <td>{formatGs(shipment.collectedAmount)}</td>
        <td>
          <span className={statusPillClass(shipment.status)}>{SHIPMENT_STATUS_LABEL[shipment.status]}</span>
          {reason ? <span className="table-muted"> · {reasons.get(reason) ?? reason}</span> : null}
        </td>
        <td>
          <button className="icon-button" type="button" onClick={onToggle} aria-label="Historial">
            <History size={16} />
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={10}>
            <ShipmentHistory shipment={shipment} reasons={reasons} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
