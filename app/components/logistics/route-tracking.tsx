"use client";

import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  History,
  Lock,
  PackageX,
  RefreshCw,
  Truck,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActionRequiredCard,
  BlockedReason,
  ConfirmImpactDialog,
  MetricCard,
  MoneyDifferenceCard,
  ProgressSummary,
  StatusPill,
  differenceTone,
  relativeTime,
  useNow,
  type ActionItem,
} from "@/app/components/logistics/logistics-ui";
import {
  formatDateTime,
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
} from "@/app/lib/logistics/client";
import type {
  AuditEntry,
  LogisticsContract,
  LogisticsRoute,
  RouteSettlement,
  SettlementSnapshot,
  Shipment,
} from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";

const REFRESH_MS = 30_000;
const STALE_AFTER_MS = 90_000;

type ShipmentFilter = "ALL" | "PENDING" | "DELIVERED" | "FAILED" | "RETURN_PENDING" | "MISSING" | "DIFFERENCE";

const FILTER_LABEL: Record<ShipmentFilter, string> = {
  ALL: "Todas",
  PENDING: "Pendientes",
  DELIVERED: "Entregadas",
  FAILED: "No entregadas",
  RETURN_PENDING: "A devolver",
  MISSING: "Faltantes",
  DIFFERENCE: "Con diferencia de cobro",
};

const hasCollectionDifference = (shipment: Shipment) =>
  shipment.status === "DELIVERED" && Number(shipment.collectedAmount) !== Number(shipment.amountToCollect);

const matches = (shipment: Shipment, filter: ShipmentFilter) => {
  switch (filter) {
    case "ALL":
      return true;
    case "PENDING":
      return ["PENDING_RECEIPT", "RECEIVED", "FAILED"].includes(shipment.status);
    case "DIFFERENCE":
      return hasCollectionDifference(shipment);
    default:
      return shipment.status === filter;
  }
};

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

function ShipmentHistory({ shipment, reasons }: { shipment: Shipment; reasons: Map<string, string> }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const result = await logisticsFetch<{ data: AuditEntry[] }>(`shipments/${shipment.id}/history`);
      if (active) setEntries(result.ok ? result.data.data : []);
    }
    void load();
    return () => {
      active = false;
    };
  }, [shipment.id]);

  return (
    <div className="logistics-history">
      {shipment.attempts.length > 0 ? (
        <ul>
          {shipment.attempts.map((attempt) => (
            <li key={attempt.id}>
              {formatDateTime(attempt.occurredAt)} · {attempt.result === "DELIVERED" ? "Entregado" : "No entregado"}
              {attempt.reason ? ` · ${reasons.get(attempt.reason) ?? attempt.reason}` : ""}
              {attempt.note ? ` · “${attempt.note}”` : ""}
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

export function RouteTracking({ routeId }: { routeId: number }) {
  const { couriers, nameOf } = useCouriers();
  const now = useNow(10_000);
  const [route, setRoute] = useState<LogisticsRoute | null>(null);
  const [snapshot, setSnapshot] = useState<SettlementSnapshot | null>(null);
  const [reasons, setReasons] = useState(new Map<string, string>());
  const [filter, setFilter] = useState<ShipmentFilter>("ALL");
  const [openShipment, setOpenShipment] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await logisticsFetch<LogisticsRoute>(`routes/${routeId}`);
    if (!result.ok) {
      setError(problemMessage(result.problem, "No se pudo cargar el recorrido."));
      return;
    }
    setRoute(result.data);
    setLoadedAt(Date.now());
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
    })();
  }, [load]);

  useEffect(() => {
    if (!route || route.status === "CLOSED") return;
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [route, load]);

  const shipments = useMemo(
    () =>
      (route?.stops ?? []).flatMap((stop) => stop.shipments.map((shipment) => ({ stop, shipment }))),
    [route]
  );
  const visible = useMemo(() => shipments.filter(({ shipment }) => matches(shipment, filter)), [shipments, filter]);

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
    setBusy(true);
    const result = await logisticsFetch<RouteSettlement>(`routes/${routeId}/close`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    setClosing(false);
    if (result.ok) void load();
    else setError(problemMessage(result.problem, "No se pudo cerrar el recorrido."));
  };

  if (!route) {
    return error ? <div className="error-box">{error}</div> : <div className="skeleton table-skeleton" />;
  }

  const byStatus = route.summary.byStatus;
  const done = route.summary.shipments - route.summary.pending;
  const courierName = nameOf(route.courierId);
  const expected = snapshot?.expectedAmount ?? Number(route.summary.deliveredExpectedAmount);
  const collected = snapshot?.collectedAmount ?? Number(route.summary.collectedAmount);
  const difference = collected - expected;
  const differenceCount = shipments.filter(({ shipment }) => hasCollectionDifference(shipment)).length;
  const stale = loadedAt !== null && route.status !== "CLOSED" && now - loadedAt > STALE_AFTER_MS;

  const action: ActionItem =
    route.status === "ASSIGNED"
      ? {
          id: "receipt",
          tone: "info",
          title: `Esperando que ${courierName} confirme los paquetes recibidos.`,
          detail: "Hasta entonces podés cambiar el repartidor.",
        }
      : route.status === "IN_PROGRESS" && route.summary.pending === 0
        ? {
            id: "close",
            tone: "progress",
            title: "Todas las guías tienen resultado.",
            detail: "Cerrá el recorrido para fijar la rendición.",
            actionLabel: "Cerrar y rendir",
            onAction: () => setClosing(true),
          }
        : route.status === "IN_PROGRESS"
          ? {
              id: "progress",
              tone: "progress",
              title: `${route.summary.pending} ${route.summary.pending === 1 ? "guía pendiente" : "guías pendientes"} de ${courierName}.`,
              detail: "El avance se actualiza solo cada 30 segundos.",
              actionLabel: "Ver pendientes",
              onAction: () => setFilter("PENDING"),
            }
          : difference !== 0
            ? {
                id: "difference",
                tone: differenceTone(difference),
                title: `La rendición tiene una diferencia de ${formatGs(difference)}.`,
                detail: `${differenceCount} ${differenceCount === 1 ? "guía entregada tiene" : "guías entregadas tienen"} un cobro distinto al esperado.`,
                actionLabel: "Ver guías con diferencia",
                onAction: () => setFilter("DIFFERENCE"),
              }
            : {
                id: "settled",
                tone: "success",
                title: "Rendición conciliada.",
                detail: `Se cobró ${formatGs(collected)}, lo esperado por las guías entregadas.`,
              };

  const closeBlocked =
    route.status === "ASSIGNED" ? "El repartidor todavía no confirmó la recepción de los paquetes." : null;

  return (
    <div className="logistics-layout">
      <section className="card card-lg logistics-layout">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Recorrido #{route.id} · {courierName}
            </h2>
            <div className="lg-header-meta">
              <StatusPill kind="route" status={route.status} />
              <span>
                {route.carrier.name} · planilla {route.import.sheetNumber} · {route.businessDate}
              </span>
              <span>
                {route.receivedAt ? `Recibido ${formatDateTime(route.receivedAt)}` : "Sin recepción confirmada"}
                {route.closedAt ? ` · cerrado ${formatDateTime(route.closedAt)}` : ""}
              </span>
            </div>
          </div>
          <div className="lg-header-meta">
            {loadedAt ? (
              <span className={stale ? "lg-stale" : undefined}>
                <Clock size={14} aria-hidden="true" /> {stale ? "Datos desactualizados · " : ""}Actualizado{" "}
                {relativeTime(loadedAt, now)}
              </span>
            ) : null}
            <button className="icon-button" type="button" onClick={() => void load()} aria-label="Actualizar recorrido">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <ActionRequiredCard item={action} />
        <ProgressSummary done={done} total={route.summary.shipments} />
        <div className="lg-metrics">
          <MetricCard
            label="Pendientes"
            value={route.summary.pending}
            tone="info"
            icon={Truck}
            active={filter === "PENDING"}
            onSelect={() => setFilter("PENDING")}
          />
          <MetricCard
            label="Entregadas"
            value={byStatus.DELIVERED}
            tone="success"
            icon={CheckCircle2}
            active={filter === "DELIVERED"}
            onSelect={() => setFilter("DELIVERED")}
          />
          <MetricCard
            label="No entregadas"
            value={byStatus.FAILED}
            tone="danger"
            icon={AlertCircle}
            active={filter === "FAILED"}
            onSelect={() => setFilter("FAILED")}
          />
          <MetricCard
            label="A devolver"
            value={byStatus.RETURN_PENDING}
            tone="warning"
            icon={Undo2}
            active={filter === "RETURN_PENDING"}
            onSelect={() => setFilter("RETURN_PENDING")}
          />
          <MetricCard
            label="Faltantes"
            value={byStatus.MISSING}
            tone="danger"
            icon={PackageX}
            active={filter === "MISSING"}
            onSelect={() => setFilter("MISSING")}
          />
          <MetricCard
            label="Cobrado"
            value={formatGs(collected)}
            tone="neutral"
            icon={Banknote}
            hint={`Esperado por entregas: ${formatGs(expected)}`}
          />
          <MoneyDifferenceCard
            expected={expected}
            collected={collected}
            active={filter === "DIFFERENCE"}
            onSelect={() => setFilter("DIFFERENCE")}
          />
        </div>
        {route.status === "ASSIGNED" ? (
          <label className="field-group">
            <span className="field-label">Cambiar repartidor (solo antes de que reciba los paquetes)</span>
            <select className="field-control" value="" disabled={busy} onChange={(event) => void reassign(event.target.value)}>
              <option value="">Elegí otro repartidor</option>
              {couriers
                .filter((courier) => courier.id !== route.courierId)
                .map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {route.status !== "CLOSED" ? (
          <div>
            <div className="form-actions">
              <button className="button-secondary" type="button" disabled={busy || closeBlocked !== null} onClick={() => setClosing(true)}>
                <Lock size={16} aria-hidden="true" /> Cerrar recorrido
              </button>
            </div>
            {closeBlocked ? <BlockedReason>{closeBlocked}</BlockedReason> : null}
          </div>
        ) : (
          <div className="form-actions">
            <a className="button-primary" href={`/api/logistics/routes/${route.id}/export?format=xlsx`}>
              <Download size={16} aria-hidden="true" /> Rendición en Excel
            </a>
            <a className="button-secondary" href={`/api/logistics/routes/${route.id}/export?format=csv`}>
              <Download size={16} aria-hidden="true" /> CSV
            </a>
          </div>
        )}
        {error ? <div className="error-box">{error}</div> : null}
      </section>

      {snapshot && snapshot.bySender.length > 0 ? (
        <section className="card card-lg logistics-layout" aria-labelledby="senders-title">
          <h2 className="card-title" id="senders-title">
            {route.status === "CLOSED" ? "Rendición por remitente" : "Rendición parcial por remitente"}
          </h2>
          <div className="table-wrap">
            <table className="data-table lg-table lg-no-sticky" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col">Remitente</th>
                  <th scope="col">Entregadas</th>
                  <th scope="col">A devolver</th>
                  <th scope="col">Faltantes</th>
                  <th scope="col">Esperado</th>
                  <th scope="col">Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.bySender.map((sender) => (
                  <tr key={sender.senderName}>
                    <td data-label="Remitente">{sender.senderName}</td>
                    <td data-label="Entregadas">{sender.delivered}</td>
                    <td data-label="A devolver">{sender.returnPending}</td>
                    <td data-label="Faltantes">{sender.missing}</td>
                    <td data-label="Esperado">{formatGs(sender.expectedAmount)}</td>
                    <td data-label="Cobrado">{formatGs(sender.collectedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card card-lg logistics-layout" aria-labelledby="shipments-title">
        <div className="card-header">
          <h2 className="card-title" id="shipments-title">
            Guías · {FILTER_LABEL[filter]} ({visible.length})
          </h2>
        </div>
        <div className="lg-filters" role="group" aria-label="Filtrar guías">
          {(Object.keys(FILTER_LABEL) as ShipmentFilter[]).map((key) => (
            <button key={key} type="button" className="lg-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {FILTER_LABEL[key]}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="empty-table-state">No hay guías con este filtro.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table lg-table">
              <caption className="sr-only">Guías del recorrido</caption>
              <thead>
                <tr>
                  <th scope="col">Guía</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Destinatario</th>
                  <th scope="col">A cobrar</th>
                  <th scope="col">Cobrado</th>
                  <th scope="col" className="lg-col-optional">Parada</th>
                  <th scope="col" className="lg-col-optional">Dirección</th>
                  <th scope="col" className="lg-col-optional">Remitente</th>
                  <th scope="col"><span className="sr-only">Historial</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ stop, shipment }) => {
                  const reason = shipment.lastAttempt?.result === "FAILED" ? shipment.lastAttempt.reason : null;
                  const open = openShipment === shipment.id;
                  return [
                    <tr key={shipment.id}>
                      <td data-label="Guía">
                        <strong>{shipment.trackingNumber}</strong>
                      </td>
                      <td data-label="Estado">
                        <StatusPill
                          kind="shipment"
                          status={shipment.status}
                          suffix={reason ? reasons.get(reason) ?? reason : undefined}
                        />
                      </td>
                      <td data-label="Destinatario">{shipment.recipientName ?? "—"}</td>
                      <td data-label="A cobrar">{formatGs(shipment.amountToCollect)}</td>
                      <td data-label="Cobrado" className={hasCollectionDifference(shipment) ? "lg-diff-negative" : undefined}>
                        {formatGs(shipment.collectedAmount)}
                      </td>
                      <td data-label="Parada" className="lg-col-optional">{stop.sequence}</td>
                      <td data-label="Dirección" className="lg-col-optional logistics-address-cell">
                        {shipment.addressText ?? "—"}
                      </td>
                      <td data-label="Remitente" className="lg-col-optional">{shipment.senderName ?? "—"}</td>
                      <td data-label="">
                        <button
                          className="button-secondary"
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenShipment(open ? null : shipment.id)}
                        >
                          <History size={16} aria-hidden="true" /> {open ? "Ocultar" : "Historial"}
                        </button>
                      </td>
                    </tr>,
                    open ? (
                      <tr key={`${shipment.id}-history`}>
                        <td colSpan={9} data-label="">
                          <ShipmentHistory shipment={shipment} reasons={reasons} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmImpactDialog
        open={closing}
        title="Cerrar el recorrido"
        tone={route.summary.pending > 0 || difference !== 0 ? "warning" : "progress"}
        busy={busy}
        confirmLabel="Cerrar y fijar la rendición"
        impacts={[
          route.summary.pending > 0
            ? `${route.summary.pending} guías sin resultado pasan a devolver.`
            : "Todas las guías tienen resultado.",
          `Cobrado ${formatGs(collected)} de ${formatGs(expected)} esperados${difference !== 0 ? ` (diferencia ${formatGs(difference)})` : ""}.`,
          `${route.summary.pending + byStatus.RETURN_PENDING} guías para devolver a ${route.carrier.name} y ${byStatus.MISSING} faltantes.`,
          "La rendición queda fija y ya no se pueden registrar entregas ni cobros.",
        ]}
        onConfirm={() => void close()}
        onCancel={() => setClosing(false)}
      />
    </div>
  );
}
