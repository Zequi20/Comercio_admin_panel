"use client";

import { Download, FileDown, FileSearch, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  ActionRequiredCard,
  differenceTone,
  ProgressSummary,
  relativeTime,
  ROUTE_STATUS,
  StatusPill,
  Stepper,
  useNow,
  type ActionItem,
  type Step,
} from "@/app/components/logistics/logistics-ui";
import {
  formatDateTime,
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
} from "@/app/lib/logistics/client";
import type { Carrier, LogisticsRoute, RouteStatus, ShipmentImport } from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";

type Tab = "routes" | "imports";

const REFRESH_MS = 60_000;
const STALE_AFTER_MS = 2 * 60_000;
const ASSIGNED_WAIT_MS = 2 * 60 * 60_000;
const RECENT_CLOSE_MS = 7 * 24 * 60 * 60_000;

/** Guides with a result: delivered, not delivered, to return or missing. */
const routeDone = (route: LogisticsRoute) => route.summary.shipments - route.summary.pending;

const routeDifference = (route: LogisticsRoute) =>
  Number(route.summary.collectedAmount) - Number(route.summary.deliveredExpectedAmount);

/** What needs attention now, most urgent first. */
function buildActions(
  drafts: ShipmentImport[],
  routes: LogisticsRoute[],
  nameOf: (id: number) => string,
  now: number
): ActionItem[] {
  const items: ActionItem[] = [];
  for (const draft of drafts) {
    const blocking = draft.summary.rowsWithErrors;
    items.push(
      blocking > 0
        ? {
            id: `draft-${draft.id}`,
            tone: "danger",
            title: `Planilla ${draft.sheetNumber}: ${blocking} ${blocking === 1 ? "fila bloquea" : "filas bloquean"} la creación del recorrido.`,
            detail: "Excluilas o corregí el archivo y volvé a subirlo.",
            actionLabel: "Resolver",
            href: `/dashboard/logistica/importaciones/${draft.id}`,
          }
        : {
            id: `draft-${draft.id}`,
            tone: "warning",
            title: `Tenés la planilla ${draft.sheetNumber} pendiente de revisión.`,
            detail: `${draft.summary.includedRows} guías listas para asignar a un repartidor.`,
            actionLabel: "Revisar y asignar",
            href: `/dashboard/logistica/importaciones/${draft.id}`,
          }
    );
  }
  for (const route of routes) {
    const href = `/dashboard/logistica/recorridos/${route.id}`;
    if (route.status === "IN_PROGRESS" && route.summary.pending === 0) {
      items.push({
        id: `close-${route.id}`,
        tone: "progress",
        title: `El recorrido #${route.id} terminó sus entregas.`,
        detail: `Falta cerrarlo para fijar la rendición de ${nameOf(route.courierId)}.`,
        actionLabel: "Cerrar y rendir",
        href,
      });
    }
    if (
      route.status === "CLOSED" &&
      route.closedAt &&
      now - Date.parse(route.closedAt) < RECENT_CLOSE_MS &&
      routeDifference(route) !== 0
    ) {
      const difference = routeDifference(route);
      items.push({
        id: `diff-${route.id}`,
        tone: differenceTone(difference),
        title: `La rendición del recorrido #${route.id} tiene una diferencia de ${formatGs(difference)}.`,
        detail: "Revisá las guías entregadas con cobro distinto al esperado.",
        actionLabel: "Revisar diferencia",
        href,
      });
    }
    if (route.status === "ASSIGNED" && now - Date.parse(route.createdAt) > ASSIGNED_WAIT_MS) {
      items.push({
        id: `receipt-${route.id}`,
        tone: "info",
        title: `El recorrido #${route.id} sigue sin recepción confirmada.`,
        detail: `${nameOf(route.courierId)} todavía no confirmó los paquetes recibidos.`,
        actionLabel: "Ver recorrido",
        href,
      });
    }
  }
  const order = { danger: 0, warning: 1, progress: 2, info: 3 } as Record<string, number>;
  return items.sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9));
}

function UploadSheet({ carriers }: { carriers: Carrier[] }) {
  const router = useRouter();
  const [carrierId, setCarrierId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingImportId, setExistingImportId] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [converting, setConverting] = useState(false);
  const selectedCarrierId = carrierId || (carriers[0] ? String(carriers[0].id) : "");
  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;

  const steps: Step[] = [
    { label: "Cargar archivo", state: file ? "done" : "current", hint: file ? file.name : "PDF de Fixy o plantilla" },
    {
      label: "Validar datos",
      state: file ? "current" : "pending",
      hint: file ? "Tocá «Analizar archivo»" : "Primero elegí el archivo",
    },
    { label: "Resolver problemas", state: "pending", hint: "Después del análisis" },
    { label: "Asignar repartidor", state: "pending", hint: "Después del análisis" },
    { label: "Crear recorrido", state: "pending", hint: "Al final" },
  ];

  /** Downloads the PDF converted to the Y4pido CSV template, to keep or check in a spreadsheet. */
  const convertToCsv = async () => {
    if (!file) return;
    setConverting(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/logistics/convert", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError(problemMessage(body, "No se pudo convertir el PDF."));
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "planilla.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No hay conexión con el portal. Reintentá en unos segundos.");
    } finally {
      setConverting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !selectedCarrierId) return;
    setSending(true);
    setError(null);
    setExistingImportId(null);
    const form = new FormData();
    form.set("file", file);
    form.set("carrierId", selectedCarrierId);
    try {
      const response = await fetch("/api/logistics/upload", {
        method: "POST",
        body: form,
        headers: { "Idempotency-Key": idempotencyKey },
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && typeof body.id === "number") {
        router.push(`/dashboard/logistica/importaciones/${body.id}`);
        return;
      }
      if (body.code === "IMPORT_SHEET_ALREADY_EXISTS" && typeof body.importId === "number") {
        setExistingImportId(body.importId);
      }
      setError(problemMessage(body, "No se pudo analizar la planilla."));
      // A rejected upload is not retried with the same key: the next attempt is a new request.
      setIdempotencyKey(newIdempotencyKey());
    } catch {
      setError("No hay conexión con el portal. Reintentá; no se duplicará la carga.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card card-lg logistics-layout" aria-labelledby="upload-title">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="upload-title">
            Nueva planilla de recorrido
          </h2>
          <p className="muted">
            Subí el PDF tal como lo entrega Fixy o la plantilla de Y4pido (.xlsx o .csv). Antes de
            crear el recorrido vas a revisar cada fila y los totales.
          </p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => window.location.assign("/api/logistics/template")}
        >
          <Download size={16} aria-hidden="true" /> Descargar plantilla
        </button>
      </div>
      <Stepper steps={steps} label="Pasos para crear un recorrido" />
      <form className="form-grid" onSubmit={submit}>
        <label className="field-group">
          <span className="field-label">Empresa de logística</span>
          <select
            className="field-control"
            value={selectedCarrierId}
            onChange={(event) => setCarrierId(event.target.value)}
            required
          >
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>
                {carrier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Archivo</span>
          <input
            className="field-control"
            type="file"
            accept=".pdf,.xlsx,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setIdempotencyKey(newIdempotencyKey());
              setError(null);
            }}
            required
          />
        </label>
        <div className="form-actions">
          {isPdf ? (
            <button
              className="button-secondary"
              type="button"
              disabled={converting || sending}
              onClick={() => void convertToCsv()}
            >
              <FileDown size={16} aria-hidden="true" /> {converting ? "Convirtiendo…" : "Descargar como CSV"}
            </button>
          ) : null}
          <button
            className="button-primary"
            type="submit"
            disabled={sending || converting || !file || !selectedCarrierId}
          >
            <FileSearch size={16} aria-hidden="true" /> {sending ? "Analizando…" : "Analizar archivo"}
          </button>
        </div>
      </form>
      {error ? (
        <div className="error-box" role="alert">
          {error}{" "}
          {existingImportId ? (
            <Link href={`/dashboard/logistica/importaciones/${existingImportId}`}>Ver la carga anterior</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RoutesTable({
  routes,
  nameOf,
  couriers,
}: {
  routes: LogisticsRoute[] | null;
  nameOf: (id: number) => string;
  couriers: { id: number; name: string }[];
}) {
  const [status, setStatus] = useState<RouteStatus | "">("");
  const [businessDate, setBusinessDate] = useState("");
  const [courierId, setCourierId] = useState("");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (routes ?? []).filter(
      (route) =>
        (!status || route.status === status) &&
        (!businessDate || route.businessDate === businessDate) &&
        (!courierId || String(route.courierId) === courierId) &&
        (!text ||
          `#${route.id} ${route.import.sheetNumber} ${nameOf(route.courierId)} ${route.carrier.name}`
            .toLowerCase()
            .includes(text))
    );
  }, [routes, status, businessDate, courierId, query, nameOf]);

  return (
    <>
      <div className="catalog-filters orders-filters">
        <label className="field-group">
          <span className="field-label">Buscar</span>
          <span style={{ position: "relative", display: "block" }}>
            <input
              className="field-control"
              type="search"
              placeholder="Recorrido, planilla o repartidor"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Search size={16} aria-hidden="true" style={{ position: "absolute", right: 12, top: 12, opacity: 0.6 }} />
          </span>
        </label>
        <label className="field-group">
          <span className="field-label">Estado</span>
          <select className="field-control" value={status} onChange={(event) => setStatus(event.target.value as RouteStatus | "")}>
            <option value="">Todos</option>
            {Object.entries(ROUTE_STATUS).map(([value, spec]) => (
              <option key={value} value={value}>
                {spec.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Repartidor</span>
          <select className="field-control" value={courierId} onChange={(event) => setCourierId(event.target.value)}>
            <option value="">Todos</option>
            {couriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Fecha</span>
          <input className="field-control" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
        </label>
      </div>
      {routes === null ? (
        <div className="skeleton table-skeleton" />
      ) : visible.length === 0 ? (
        <p className="empty-table-state">
          {routes.length === 0 ? "Todavía no hay recorridos: importá una planilla para crear el primero." : "No hay recorridos con estos filtros."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table lg-table">
            <caption className="sr-only">Recorridos</caption>
            <thead>
              <tr>
                <th scope="col">Recorrido</th>
                <th scope="col">Repartidor</th>
                <th scope="col">Estado</th>
                <th scope="col">Avance</th>
                <th scope="col" className="lg-col-optional">Fecha</th>
                <th scope="col" className="lg-col-optional">Planilla</th>
                <th scope="col" className="lg-col-optional">Cobrado / esperado</th>
                <th scope="col"><span className="sr-only">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((route) => (
                <tr key={route.id}>
                  <td data-label="Recorrido">
                    <strong>#{route.id}</strong>
                  </td>
                  <td data-label="Repartidor">{nameOf(route.courierId)}</td>
                  <td data-label="Estado">
                    <StatusPill kind="route" status={route.status} />
                  </td>
                  <td data-label="Avance" style={{ minWidth: 170 }}>
                    <ProgressSummary done={routeDone(route)} total={route.summary.shipments} />
                  </td>
                  <td data-label="Fecha" className="lg-col-optional">{route.businessDate}</td>
                  <td data-label="Planilla" className="lg-col-optional">
                    {route.carrier.name} · {route.import.sheetNumber}
                  </td>
                  <td data-label="Cobrado / esperado" className="lg-col-optional">
                    {formatGs(route.summary.collectedAmount)} /{" "}
                    <span className="table-muted">{formatGs(route.summary.deliveredExpectedAmount)}</span>
                  </td>
                  <td data-label="">
                    <Link className="button-secondary" href={`/dashboard/logistica/recorridos/${route.id}`}>
                      Ver recorrido
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ImportsTable({ imports }: { imports: ShipmentImport[] | null }) {
  if (imports === null) return <div className="skeleton table-skeleton" />;
  if (imports.length === 0) {
    return <p className="empty-table-state">Todavía no se importó ninguna planilla.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table lg-table">
        <caption className="sr-only">Importaciones</caption>
        <thead>
          <tr>
            <th scope="col">Planilla</th>
            <th scope="col">Estado</th>
            <th scope="col">Guías</th>
            <th scope="col">Filas bloqueantes</th>
            <th scope="col" className="lg-col-optional">Empresa</th>
            <th scope="col" className="lg-col-optional">Cargada</th>
            <th scope="col"><span className="sr-only">Acción</span></th>
          </tr>
        </thead>
        <tbody>
          {imports.map((item) => (
            <tr key={item.id}>
              <td data-label="Planilla">
                <strong>{item.sheetNumber}</strong>
              </td>
              <td data-label="Estado">
                <StatusPill kind="import" status={item.status} />
              </td>
              <td data-label="Guías">{item.summary.totalRows}</td>
              <td data-label="Filas bloqueantes">{item.summary.rowsWithErrors}</td>
              <td data-label="Empresa" className="lg-col-optional">{item.carrier.name}</td>
              <td data-label="Cargada" className="lg-col-optional">{formatDateTime(item.createdAt)}</td>
              <td data-label="">
                {item.routeId ? (
                  <Link className="button-secondary" href={`/dashboard/logistica/recorridos/${item.routeId}`}>
                    Ver recorrido #{item.routeId}
                  </Link>
                ) : (
                  <Link
                    className={item.status === "DRAFT" ? "button-primary" : "button-secondary"}
                    href={`/dashboard/logistica/importaciones/${item.id}`}
                  >
                    {item.status === "DRAFT" ? "Revisar" : "Ver"}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LogisticsOverview() {
  const [tab, setTab] = useState<Tab>("routes");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [routes, setRoutes] = useState<LogisticsRoute[] | null>(null);
  const [imports, setImports] = useState<ShipmentImport[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { couriers, nameOf } = useCouriers();
  const now = useNow();

  const load = useCallback(async () => {
    const [carrierResult, routeResult, importResult] = await Promise.all([
      logisticsFetch<{ data: Carrier[] }>("carriers"),
      logisticsFetch<{ data: LogisticsRoute[] }>("routes?limit=50"),
      logisticsFetch<{ data: ShipmentImport[] }>("imports?limit=50"),
    ]);
    if (!carrierResult.ok) {
      setError(
        carrierResult.status === 404
          ? "El módulo de logística no está habilitado en el servicio de pedidos."
          : problemMessage(carrierResult.problem, "No se pudo conectar con logística.")
      );
      return;
    }
    setError(null);
    setCarriers(carrierResult.data.data);
    if (routeResult.ok) setRoutes(routeResult.data.data);
    if (importResult.ok) setImports(importResult.data.data);
    setLoadedAt(Date.now());
  }, []);

  useEffect(() => {
    async function loadInitial() {
      await load();
    }
    void loadInitial();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const actions = useMemo(
    () => buildActions((imports ?? []).filter((item) => item.status === "DRAFT"), routes ?? [], nameOf, now),
    [imports, routes, nameOf, now]
  );

  if (error) return <div className="error-box">{error}</div>;

  const stale = loadedAt !== null && now - loadedAt > STALE_AFTER_MS;

  return (
    <div className="logistics-layout">
      {actions.length > 0 ? (
        <div className="lg-actions">
          {actions.slice(0, 3).map((item) => (
            <ActionRequiredCard key={item.id} item={item} />
          ))}
          {actions.length > 3 ? (
            <p className="muted">
              Y {actions.length - 3} {actions.length - 3 === 1 ? "tarea más" : "tareas más"} en las listas de abajo.
            </p>
          ) : null}
        </div>
      ) : null}

      <UploadSheet carriers={carriers} />

      <section className="card card-lg logistics-layout">
        <div className="card-header">
          <div className="logistics-tabs" role="tablist" aria-label="Listados de logística">
            {(["routes", "imports"] as const).map((value) => (
              <button
                key={value}
                id={`tab-${value}`}
                className={tab === value ? "button-tonal" : "button-secondary"}
                role="tab"
                aria-selected={tab === value}
                aria-controls={`panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                type="button"
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    const next = value === "routes" ? "imports" : "routes";
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {value === "routes" ? "Recorridos" : "Importaciones"}
              </button>
            ))}
          </div>
          <div className="lg-header-meta">
            {loadedAt ? (
              <span className={stale ? "lg-stale" : undefined}>
                {stale ? "Datos desactualizados · " : ""}Actualizado {relativeTime(loadedAt, now)}
              </span>
            ) : null}
            <button className="icon-button" type="button" onClick={() => void load()} aria-label="Actualizar listados">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="logistics-layout"
        >
          {tab === "routes" ? (
            <RoutesTable routes={routes} nameOf={nameOf} couriers={couriers} />
          ) : (
            <ImportsTable imports={imports} />
          )}
        </div>
      </section>
    </div>
  );
}
