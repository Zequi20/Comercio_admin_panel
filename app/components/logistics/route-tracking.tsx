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
  UserRoundCog,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActionRequiredCard,
  BlockedReason,
  ConfirmImpactDialog,
  InfoNote,
  MetricCard,
  MoneyDifferenceCard,
  ProgressSummary,
  StatusPill,
  differenceTone,
  relativeTime,
  routeDisplayStatus,
  useNow,
} from "@/app/components/logistics/logistics-ui";
import {
  describeMoneyDifference,
  formatDate,
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
import { paginateRows, TablePagination, type TablePaginationState } from "@/app/components/table-pagination";

const REFRESH_MS = 30_000;

/** "Faltan Gs. 30.000" inside a sentence: only the first letter goes lower case, not "Gs.". */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const GUIDES_PAGE_SIZE = 25;
const STALE_AFTER_MS = 90_000;

type ShipmentFilter = "ALL" | "PENDING" | "DELIVERED" | "FAILED" | "RETURN_PENDING" | "MISSING" | "DIFFERENCE";

const FILTER_LABEL: Record<ShipmentFilter, string> = {
  ALL: "Todas",
  PENDING: "Pendientes",
  DELIVERED: "Entregadas",
  FAILED: "No entregadas",
  RETURN_PENDING: "Para devolver",
  MISSING: "No recibidas",
  DIFFERENCE: "Cobradas por otro monto",
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
  SHIPMENT_MISSING: "Marcada como no recibida",
  ATTEMPT_DELIVERED: "Entregada",
  ATTEMPT_FAILED: "No entregada",
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
              {formatDateTime(attempt.occurredAt)} · {attempt.result === "DELIVERED" ? "Entregada" : "No entregada"}
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
  // Reassigning is two steps (choose, then confirm) so a stray click in the dropdown never moves a
  // route, and the result is said out loud instead of only changing the title.
  const [newCourierId, setNewCourierId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignNotice, setReassignNotice] = useState<string | null>(null);
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
  // The whole route is already loaded, so the guides are paged here; a new filter starts at page 1.
  const [guidesPagination, setGuidesPagination] = useState<TablePaginationState>({ page: 1, pageSize: GUIDES_PAGE_SIZE });
  const guidesPage = useMemo(() => paginateRows(visible, guidesPagination), [visible, guidesPagination]);
  const selectFilter = (next: ShipmentFilter) => {
    setFilter(next);
    setGuidesPagination((current) => ({ ...current, page: 1 }));
  };

  const reassign = async () => {
    if (!route || !newCourierId) return;
    const target = couriers.find((courier) => String(courier.id) === newCourierId);
    setBusy(true);
    setError(null);
    setReassignNotice(null);
    const result = await logisticsFetch<LogisticsRoute>(`routes/${routeId}`, {
      method: "PATCH",
      body: { courierId: Number(newCourierId), expectedVersion: route.version },
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    setReassigning(false);
    if (result.ok) {
      setRoute(result.data);
      setNewCourierId("");
      setReassignNotice(
        `Listo: el recorrido ahora es de ${target?.name ?? nameOf(result.data.courierId)}. Le enviamos un aviso para que confirme que tiene los paquetes.`
      );
      return;
    }
    // Someone else changed the route meanwhile (or the courier already received): show what is true now.
    if (result.problem.code === "VERSION_CONFLICT" || result.problem.code === "ROUTE_ALREADY_STARTED") void load();
    setError(problemMessage(result.problem, "No se pudo cambiar el repartidor."));
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

  const carrierName = route.carrier.name;
  const displayStatus = routeDisplayStatus(route);
  const returnsAtClose = route.summary.pending + byStatus.RETURN_PENDING;

  // Only what the admin has to do is an "Acción requerida"; the rest is context.
  const attention =
    displayStatus === "FINISHED" ? (
      <ActionRequiredCard
        item={{
          id: "close",
          tone: "warning",
          title: "Todas las guías tienen resultado: falta cerrar el recorrido.",
          detail: "Al cerrarlo se guarda la rendición final.",
          actionLabel: "Cerrar recorrido",
          onAction: () => setClosing(true),
        }}
      />
    ) : route.status === "CLOSED" && difference !== 0 ? (
      <ActionRequiredCard
        item={{
          id: "difference",
          tone: differenceTone(difference),
          title: `${describeMoneyDifference(difference)} en la rendición.`,
          detail: `${differenceCount} ${differenceCount === 1 ? "guía entregada se cobró" : "guías entregadas se cobraron"} por otro monto.`,
          actionLabel: "Ver esas guías",
          onAction: () => selectFilter("DIFFERENCE"),
        }}
      />
    ) : route.status === "ASSIGNED" ? (
      <InfoNote tone="neutral">
        Esperando que {courierName} confirme que tiene los paquetes. Mientras tanto podés cambiar el repartidor.
      </InfoNote>
    ) : route.status === "IN_PROGRESS" ? (
      <InfoNote tone="info">
        {route.summary.pending} {route.summary.pending === 1 ? "guía pendiente" : "guías pendientes"}. El avance se
        actualiza solo cada 30 segundos.
      </InfoNote>
    ) : (
      <InfoNote tone="success" icon={CheckCircle2}>
        Rendición sin diferencias: se cobró {formatGs(collected)}, lo que correspondía por las guías entregadas.
      </InfoNote>
    );

  const newCourier = couriers.find((courier) => String(courier.id) === newCourierId) ?? null;

  const closeBlocked =
    route.status === "ASSIGNED"
      ? "No se puede cerrar todavía: el repartidor no confirmó que tiene los paquetes."
      : null;

  return (
    <div className="logistics-layout">
      <section className="card card-lg logistics-layout">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Planilla {route.import.sheetNumber} · {courierName}
            </h2>
            <div className="lg-header-meta">
              <StatusPill kind="route" status={displayStatus} />
              <span>
                {carrierName} · {formatDate(route.businessDate)} · recorrido #{route.id} ·{" "}
                <Link href={`/dashboard/logistica/importaciones/${route.import.id}`}>Ver planilla completa</Link>
              </span>
              <span>
                Total de la planilla: {formatGs(route.summary.expectedAmount)} en {route.summary.shipments} guías
              </span>
              {route.receivedAt ? <span>Paquetes recibidos el {formatDateTime(route.receivedAt)}</span> : null}
              {route.closedAt ? <span>Cerrado el {formatDateTime(route.closedAt)}</span> : null}
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
        {attention}
        <ProgressSummary done={done} total={route.summary.shipments} />
        <div className="lg-metrics">
          <MetricCard
            label="Pendientes"
            value={route.summary.pending}
            tone="info"
            icon={Truck}
            hint={
              byStatus.FAILED > 0
                ? `Incluye ${byStatus.FAILED} no ${byStatus.FAILED === 1 ? "entregada" : "entregadas"} para reintentar`
                : undefined
            }
            active={filter === "PENDING"}
            onSelect={() => selectFilter("PENDING")}
          />
          <MetricCard
            label="Entregadas"
            value={byStatus.DELIVERED}
            tone="success"
            icon={CheckCircle2}
            active={filter === "DELIVERED"}
            onSelect={() => selectFilter("DELIVERED")}
          />
          <MetricCard
            label="No entregadas"
            value={byStatus.FAILED}
            tone="neutral"
            icon={AlertCircle}
            hint="Se pueden reintentar hasta cerrar"
            active={filter === "FAILED"}
            onSelect={() => selectFilter("FAILED")}
          />
          <MetricCard
            label="Para devolver"
            value={byStatus.RETURN_PENDING}
            tone="neutral"
            icon={Undo2}
            hint={`Vuelven a ${carrierName}`}
            active={filter === "RETURN_PENDING"}
            onSelect={() => selectFilter("RETURN_PENDING")}
          />
          <MetricCard
            label="No recibidas"
            value={byStatus.MISSING}
            tone={byStatus.MISSING > 0 ? "warning" : "neutral"}
            icon={PackageX}
            hint={`${carrierName} no se las entregó al repartidor`}
            active={filter === "MISSING"}
            onSelect={() => selectFilter("MISSING")}
          />
          <MetricCard
            label="Cobrado"
            value={formatGs(collected)}
            tone="neutral"
            icon={Banknote}
            hint={`De ${formatGs(expected)} a cobrar por lo entregado`}
          />
          <MoneyDifferenceCard
            expected={expected}
            collected={collected}
            active={filter === "DIFFERENCE"}
            onSelect={() => selectFilter("DIFFERENCE")}
          />
        </div>
        {route.status === "ASSIGNED" ? (
          <div className="lg-reassign">
            <label className="field-group">
              <span className="field-label">Cambiar repartidor</span>
              <select
                className="field-control"
                value={newCourierId}
                disabled={busy}
                onChange={(event) => {
                  setNewCourierId(event.target.value);
                  setReassignNotice(null);
                }}
              >
                <option value="">Elegí otro repartidor</option>
                {couriers
                  .filter((courier) => courier.id !== route.courierId)
                  .map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.name}
                      {courier.available === false ? " (no disponible)" : ""}
                    </option>
                  ))}
              </select>
              <span className="field-hint">
                Se puede cambiar hasta que {courierName} confirme que tiene los paquetes.
              </span>
            </label>
            <button
              className="button-secondary"
              type="button"
              disabled={busy || !newCourierId}
              onClick={() => setReassigning(true)}
            >
              <UserRoundCog size={16} aria-hidden="true" />{" "}
              {newCourier ? `Cambiar a ${newCourier.name}` : "Cambiar repartidor"}
            </button>
          </div>
        ) : route.status === "IN_PROGRESS" ? (
          <BlockedReason>
            Ya no se puede cambiar el repartidor: {courierName} confirmó que tiene los paquetes
            {route.receivedAt ? ` el ${formatDateTime(route.receivedAt)}` : ""}.
          </BlockedReason>
        ) : null}
        {reassignNotice ? (
          <InfoNote tone="success" icon={CheckCircle2}>
            {reassignNotice}
          </InfoNote>
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
              <Download size={16} aria-hidden="true" /> Descargar rendición (Excel)
            </a>
            <a className="button-secondary" href={`/api/logistics/routes/${route.id}/export?format=csv`}>
              <Download size={16} aria-hidden="true" /> Descargar CSV
            </a>
          </div>
        )}
        {error ? <div className="error-box">{error}</div> : null}
      </section>

      {snapshot && snapshot.bySender.length > 0 ? (
        <section className="card card-lg logistics-layout" aria-labelledby="senders-title">
          <h2 className="card-title" id="senders-title">
            {route.status === "CLOSED" ? "Rendición por remitente" : "Rendición por remitente (hasta ahora)"}
          </h2>
          <p className="muted">
            El remitente es quien envía el paquete (por ejemplo, la tienda). {carrierName} es la empresa de logística
            que lo transporta.
          </p>
          <div className="table-wrap">
            <table className="data-table lg-table lg-no-sticky" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col">Remitente</th>
                  <th scope="col">Entregadas</th>
                  <th scope="col">Para devolver</th>
                  <th scope="col">No recibidas</th>
                  <th scope="col">A cobrar por lo entregado</th>
                  <th scope="col">Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.bySender.map((sender) => (
                  <tr key={sender.senderName}>
                    <td data-label="Remitente">{sender.senderName}</td>
                    <td data-label="Entregadas">{sender.delivered}</td>
                    <td data-label="Para devolver">{sender.returnPending}</td>
                    <td data-label="No recibidas">{sender.missing}</td>
                    <td data-label="A cobrar por lo entregado">{formatGs(sender.expectedAmount)}</td>
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
            <button key={key} type="button" className="lg-chip" aria-pressed={filter === key} onClick={() => selectFilter(key)}>
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
                {guidesPage.rows.map(({ stop, shipment }) => {
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
        {visible.length > 0 ? (
          <TablePagination
            currentPage={guidesPage.currentPage}
            itemLabelPlural="guías"
            itemLabelSingular="guía"
            pageSize={guidesPage.pageSize}
            totalItems={guidesPage.totalItems}
            totalPages={guidesPage.totalPages}
            onPageChange={(page) => setGuidesPagination((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => setGuidesPagination({ page: 1, pageSize })}
          />
        ) : null}
      </section>

      <ConfirmImpactDialog
        open={reassigning}
        title="Cambiar el repartidor"
        tone="warning"
        busy={busy}
        confirmLabel={newCourier ? `Cambiar a ${newCourier.name}` : "Cambiar"}
        impacts={[
          `${courierName} deja de ver este recorrido en su app.`,
          `${newCourier?.name ?? "El nuevo repartidor"} recibe un aviso y tiene que confirmar que tiene los paquetes.`,
          ...(newCourier?.available === false ? [`${newCourier.name} figura como no disponible.`] : []),
        ]}
        onConfirm={() => void reassign()}
        onCancel={() => setReassigning(false)}
      />
      <ConfirmImpactDialog
        open={closing}
        title="Cerrar el recorrido"
        tone={route.summary.pending > 0 || difference !== 0 ? "warning" : "progress"}
        busy={busy}
        confirmLabel="Cerrar y guardar la rendición"
        impacts={[
          route.summary.pending > 0
            ? `${route.summary.pending} ${route.summary.pending === 1 ? "guía sin entregar pasa" : "guías sin entregar pasan"} a devolver.`
            : "Todas las guías tienen resultado.",
          `Se cobró ${formatGs(collected)} de ${formatGs(expected)} a cobrar por lo entregado${difference !== 0 ? ` (${lowerFirst(describeMoneyDifference(difference))})` : ""}.`,
          `${returnsAtClose} ${returnsAtClose === 1 ? "guía vuelve" : "guías vuelven"} a ${carrierName}${byStatus.MISSING > 0 ? ` y ${byStatus.MISSING} no se ${byStatus.MISSING === 1 ? "recibió" : "recibieron"}` : ""}.`,
          "La rendición final queda guardada: después no se pueden registrar entregas ni cobros.",
        ]}
        onConfirm={() => void close()}
        onCancel={() => setClosing(false)}
      />
    </div>
  );
}
