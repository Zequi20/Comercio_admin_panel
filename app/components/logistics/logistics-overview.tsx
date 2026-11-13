"use client";

import { Download, FileDown, FileSearch, RefreshCw, Search, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActionRequiredCard,
  differenceTone,
  ProgressSummary,
  relativeTime,
  ROUTE_STATUS,
  routeDisplayStatus,
  StatusPill,
  Stepper,
  useNow,
  type ActionItem,
  type Step,
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
import type { Carrier, LogisticsRoute, ShipmentImport } from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";
import { listPath, usePagedList, type PagedResult } from "@/app/lib/logistics/use-paged-list";
import { TablePagination, type TablePaginationState } from "@/app/components/table-pagination";

type Tab = "routes" | "imports";

const REFRESH_MS = 60_000;
const STALE_AFTER_MS = 2 * 60_000;
const ASSIGNED_WAIT_MS = 2 * 60 * 60_000;
const RECENT_CLOSE_MS = 7 * 24 * 60 * 60_000;

/** Guides with a final result: delivered, to return or not received (a failed attempt can be retried). */
const routeDone = (route: LogisticsRoute) => route.summary.shipments - route.summary.pending;

const routeDifference = (route: LogisticsRoute) =>
  Number(route.summary.collectedAmount) - Number(route.summary.deliveredExpectedAmount);

/** The merchant knows a route by its sheet and courier, not by the internal number. */
const routeName = (route: LogisticsRoute, nameOf: (id: number) => string) =>
  `planilla ${route.import.sheetNumber} de ${nameOf(route.courierId)}`;

const VISIBLE_ACTIONS = 3;

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
            title: `La planilla ${draft.sheetNumber} está lista para asignar.`,
            detail: `${draft.summary.includedRows} guías sin problemas bloqueantes. Revisalas y elegí el repartidor.`,
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
        tone: "warning",
        title: `La ${routeName(route, nameOf)} terminó sus entregas.`,
        detail: "Cerrá el recorrido para guardar la rendición final.",
        actionLabel: "Cerrar recorrido",
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
        title: `${describeMoneyDifference(difference)} en la rendición de la ${routeName(route, nameOf)}.`,
        detail: "Revisá las guías entregadas que se cobraron por otro monto.",
        actionLabel: "Revisar diferencia",
        href,
      });
    }
    if (route.status === "ASSIGNED" && now - Date.parse(route.createdAt) > ASSIGNED_WAIT_MS) {
      items.push({
        id: `receipt-${route.id}`,
        tone: "info",
        title: `${nameOf(route.courierId)} no confirmó que tiene los paquetes de la planilla ${route.import.sheetNumber}.`,
        detail: "Pasaron más de 2 horas desde que se asignó. Podés llamarlo o asignar otro repartidor.",
        actionLabel: "Ver recorrido",
        href,
      });
    }
  }
  const order = { danger: 0, warning: 1, progress: 2, info: 3 } as Record<string, number>;
  return items.sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9));
}

const FILE_CHANGED =
  "No se pudo leer el archivo: se movió o se modificó después de elegirlo. Volvé a seleccionarlo.";

/**
 * Reads the chosen file into memory before sending it. If the file was moved or edited after it
 * was picked, the browser cannot read it and aborts the upload with a bare network error (Chrome's
 * ERR_UPLOAD_FILE_CHANGED); reading it first turns that into a clear message, and the upload then
 * sends this copy, which no longer depends on the file on disk.
 */
async function readChosenFile(file: File): Promise<File | null> {
  try {
    return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return null;
  }
}

/** Carriers are platform configuration enabled by Y4pido, not something merchants create. */
const CARRIER_HELP = "Las empresas de logística se activan a pedido. Si trabajás con otra, escribinos.";

/**
 * `carriers` is null while loading. With a single active carrier there is nothing to choose, so it
 * is shown as a fact instead of a one-option dropdown; the selector only appears with two or more,
 * and then without a preselection so the choice is deliberate.
 */
function UploadSheet({ carriers }: { carriers: Carrier[] | null }) {
  const router = useRouter();
  const [carrierId, setCarrierId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingImportId, setExistingImportId] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [converting, setConverting] = useState(false);
  // Spreadsheet exports may not print the sheet number; the PDF always does.
  const [sheetNumber, setSheetNumber] = useState("");
  const [sheetNumberRequired, setSheetNumberRequired] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** The file on disk changed: drop the stale selection so the merchant picks it again. */
  const forgetFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setError(FILE_CHANGED);
  };
  const onlyCarrier = carriers?.length === 1 ? carriers[0] : null;
  const selectedCarrierId = onlyCarrier ? String(onlyCarrier.id) : carrierId;
  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;

  const steps: Step[] = [
    { label: "Subir archivo", state: file ? "done" : "current", hint: file ? file.name : "PDF o Excel de Fixy, o el modelo" },
    {
      label: "Revisar filas",
      state: file ? "current" : "pending",
      hint: file ? "Tocá «Analizar archivo»" : "Ves cada guía y los totales",
    },
    { label: "Asignar y crear", state: "pending", hint: "Elegís el repartidor" },
  ];

  /** Downloads the PDF converted to the Y4pido CSV template, to keep or check in a spreadsheet. */
  const convertToCsv = async () => {
    if (!file) return;
    setConverting(true);
    setError(null);
    const copy = await readChosenFile(file);
    if (!copy) {
      forgetFile();
      setConverting(false);
      return;
    }
    const form = new FormData();
    form.set("file", copy);
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
    const copy = await readChosenFile(file);
    if (!copy) {
      forgetFile();
      setSending(false);
      return;
    }
    const form = new FormData();
    form.set("file", copy);
    form.set("carrierId", selectedCarrierId);
    if (!isPdf && sheetNumber.trim()) form.set("sheetNumber", sheetNumber.trim());
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
      if (body.code === "SHEET_NUMBER_REQUIRED") {
        setSheetNumberRequired(true);
        window.setTimeout(() => document.getElementById("sheet-number")?.focus(), 0);
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
            Subí el PDF tal como lo entrega Fixy, el Excel que exporta (.xls o .xlsx), o el modelo de
            Excel completo (.xlsx o .csv). Nada se asigna hasta que revises las filas y elijas el
            repartidor.
          </p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => window.location.assign("/api/logistics/template")}
        >
          <Download size={16} aria-hidden="true" /> Descargar modelo de Excel
        </button>
      </div>
      <Stepper steps={steps} label="Pasos para crear un recorrido" />
      <form className="form-grid" onSubmit={submit}>
        {carriers === null ? (
          <div className="field-group" aria-busy="true">
            <span className="field-label">Empresa de logística</span>
            <div className="skeleton lg-carrier-skeleton" />
          </div>
        ) : onlyCarrier ? (
          <div className="field-group" role="group" aria-labelledby="carrier-label">
            <span className="field-label" id="carrier-label">
              Empresa de logística
            </span>
            <p className="lg-carrier-fixed">
              <Truck size={16} aria-hidden="true" />
              <strong>{onlyCarrier.name}</strong>
            </p>
            <span className="field-hint">{CARRIER_HELP}</span>
          </div>
        ) : carriers.length === 0 ? (
          <div className="field-group">
            <span className="field-label">Empresa de logística</span>
            <p className="lg-carrier-fixed lg-carrier-empty" role="status">
              Todavía no hay empresas de logística habilitadas. Escribinos para activar la tuya.
            </p>
          </div>
        ) : (
          <label className="field-group">
            <span className="field-label">Empresa de logística</span>
            <select
              className="field-control"
              value={carrierId}
              onChange={(event) => setCarrierId(event.target.value)}
              required
            >
              <option value="" disabled>
                Elegí la empresa que te entregó la planilla
              </option>
              {carriers.map((carrier) => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </option>
              ))}
            </select>
            <span className="field-hint">{CARRIER_HELP}</span>
          </label>
        )}
        <label className="field-group">
          <span className="field-label">Archivo</span>
          <input
            className="field-control"
            ref={fileInput}
            type="file"
            accept=".pdf,.xls,.xlsx,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setIdempotencyKey(newIdempotencyKey());
              setError(null);
            }}
            required
          />
        </label>
        {file && !isPdf ? (
          <label className="field-group">
            <span className="field-label">
              N.º de planilla{sheetNumberRequired ? "" : " (si el archivo no lo trae)"}
            </span>
            <input
              id="sheet-number"
              className="field-control"
              inputMode="numeric"
              maxLength={60}
              placeholder="Por ejemplo, 16523"
              value={sheetNumber}
              aria-invalid={sheetNumberRequired && !sheetNumber.trim()}
              onChange={(event) => setSheetNumber(event.target.value)}
              required={sheetNumberRequired}
            />
            <span className="field-hint">
              El Excel que exporta Fixy no incluye el número: copialo de la planilla impresa o del sistema de Fixy.
            </span>
          </label>
        ) : null}
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

const ROUTE_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** The status filter shown to the merchant, as API query parameters. */
const statusQuery = (status: string): Record<string, string | undefined> => {
  switch (status) {
    case "FINISHED":
      return { status: "IN_PROGRESS", finished: "true" };
    case "IN_PROGRESS":
      return { status: "IN_PROGRESS", finished: "false" };
    default:
      return { status: status || undefined };
  }
};

const totalPagesOf = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/**
 * Routes, one page at a time from the API. Filters and the search run on the server, so they cover
 * every route and not only the ones on screen; changing any of them goes back to page 1.
 */
function RoutesTable({
  nameOf,
  couriers,
  refreshKey,
}: {
  nameOf: (id: number) => string;
  couriers: { id: number; name: string }[];
  refreshKey: number;
}) {
  const [status, setStatus] = useState("");
  const [businessDate, setBusinessDate] = useState("");
  const [courierId, setCourierId] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<TablePaginationState>({ page: 1, pageSize: ROUTE_PAGE_SIZE });

  // The search waits for a pause in typing instead of asking the API on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const path = listPath("routes", {
    page: pagination.page,
    pageSize: pagination.pageSize,
    search,
    courierId,
    businessDate,
    ...statusQuery(status),
  });
  const { result, loading, error } = usePagedList<LogisticsRoute>(path, refreshKey);
  const filtered = Boolean(status || businessDate || courierId || search);
  const totalPages = result ? totalPagesOf(result.total, result.pageSize) : 1;
  // A refresh can leave the current page past the end (routes removed by a filter elsewhere).
  const currentPage = Math.min(pagination.page, totalPages);

  const changeFilter = (apply: () => void) => {
    apply();
    setPagination((page) => ({ ...page, page: 1 }));
  };

  return (
    <>
      <div className="catalog-filters orders-filters">
        <label className="field-group">
          <span className="field-label">Buscar</span>
          <span style={{ position: "relative", display: "block" }}>
            <input
              className="field-control"
              type="search"
              placeholder="N.º de planilla o de recorrido"
              value={query}
              onChange={(event) => changeFilter(() => setQuery(event.target.value))}
            />
            <Search size={16} aria-hidden="true" style={{ position: "absolute", right: 12, top: 12, opacity: 0.6 }} />
          </span>
        </label>
        <label className="field-group">
          <span className="field-label">Estado</span>
          <select className="field-control" value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value))}>
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
          <select
            className="field-control"
            value={courierId}
            onChange={(event) => changeFilter(() => setCourierId(event.target.value))}
          >
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
          <input
            className="field-control"
            type="date"
            value={businessDate}
            onChange={(event) => changeFilter(() => setBusinessDate(event.target.value))}
          />
        </label>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {result === null ? (
        <div className="skeleton table-skeleton" />
      ) : result.total === 0 ? (
        <p className="empty-table-state">
          {filtered ? "No hay recorridos con estos filtros." : "Todavía no hay recorridos: importá una planilla para crear el primero."}
        </p>
      ) : (
        <>
          <div className="table-wrap" aria-busy={loading}>
            <table className={`data-table lg-table${loading ? " lg-table-loading" : ""}`}>
              <caption className="sr-only">Recorridos</caption>
              <thead>
                <tr>
                  <th scope="col">Planilla</th>
                  <th scope="col">Repartidor</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Avance</th>
                  <th scope="col" className="lg-col-optional">Fecha</th>
                  <th scope="col" className="lg-col-optional">Empresa</th>
                  <th scope="col" className="lg-col-optional">Cobrado</th>
                  <th scope="col"><span className="sr-only">Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((route) => (
                  <tr key={route.id}>
                    <td data-label="Planilla">
                      <span>
                        <strong>{route.import.sheetNumber}</strong>
                        <span className="table-muted"> · recorrido #{route.id}</span>
                      </span>
                    </td>
                    <td data-label="Repartidor">{nameOf(route.courierId)}</td>
                    <td data-label="Estado">
                      <StatusPill kind="route" status={routeDisplayStatus(route)} />
                    </td>
                    <td data-label="Avance" style={{ minWidth: 170 }}>
                      <ProgressSummary done={routeDone(route)} total={route.summary.shipments} />
                    </td>
                    <td data-label="Fecha" className="lg-col-optional">{formatDate(route.businessDate)}</td>
                    <td data-label="Empresa" className="lg-col-optional">{route.carrier.name}</td>
                    <td data-label="Cobrado" className="lg-col-optional">
                      <span>
                        {formatGs(route.summary.collectedAmount)}
                        <span className="lg-cell-note">
                          de {formatGs(route.summary.deliveredExpectedAmount)} a cobrar por lo entregado
                        </span>
                      </span>
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
          <TablePagination
            currentPage={currentPage}
            itemLabelPlural="recorridos"
            itemLabelSingular="recorrido"
            pageSize={pagination.pageSize}
            totalItems={result.total}
            totalPages={totalPages}
            onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
          />
        </>
      )}
    </>
  );
}

function ImportsTable({ refreshKey }: { refreshKey: number }) {
  const [pagination, setPagination] = useState<TablePaginationState>({ page: 1, pageSize: ROUTE_PAGE_SIZE });
  const path = listPath("imports", { page: pagination.page, pageSize: pagination.pageSize });
  const { result, loading, error } = usePagedList<ShipmentImport>(path, refreshKey);
  const totalPages = result ? totalPagesOf(result.total, result.pageSize) : 1;
  const currentPage = Math.min(pagination.page, totalPages);

  if (error && result === null) return <div className="error-box">{error}</div>;
  if (result === null) return <div className="skeleton table-skeleton" />;
  if (result.total === 0) {
    return <p className="empty-table-state">Todavía no se importó ninguna planilla.</p>;
  }
  return (
    <>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="table-wrap" aria-busy={loading}>
        <table className={`data-table lg-table${loading ? " lg-table-loading" : ""}`}>
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
            {result.data.map((item) => (
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
                  {(item.routeIds?.length ?? 0) > 1 ? (
                    <Link className="button-secondary" href={`/dashboard/logistica/importaciones/${item.id}`}>
                      Ver {item.routeIds?.length} recorridos
                    </Link>
                  ) : item.routeId ? (
                    <Link className="button-secondary" href={`/dashboard/logistica/recorridos/${item.routeId}`}>
                      Ver recorrido
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
      <TablePagination
        currentPage={currentPage}
        itemLabelPlural="importaciones"
        itemLabelSingular="importación"
        pageSize={pagination.pageSize}
        totalItems={result.total}
        totalPages={totalPages}
        onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
      />
    </>
  );
}

/** Everything the "Acción requerida" cards look at, independent of the page shown in the tables. */
type AttentionData = { drafts: ShipmentImport[]; routes: LogisticsRoute[] };

const ATTENTION_PAGE = { page: 1, pageSize: 100 };

async function loadAttention(now: number): Promise<AttentionData | null> {
  const closedSince = new Date(now - RECENT_CLOSE_MS).toISOString();
  const [drafts, finished, assigned, closed] = await Promise.all([
    logisticsFetch<PagedResult<ShipmentImport>>(listPath("imports", { status: "DRAFT", ...ATTENTION_PAGE })),
    logisticsFetch<PagedResult<LogisticsRoute>>(
      listPath("routes", { status: "IN_PROGRESS", finished: "true", ...ATTENTION_PAGE })
    ),
    logisticsFetch<PagedResult<LogisticsRoute>>(listPath("routes", { status: "ASSIGNED", ...ATTENTION_PAGE })),
    logisticsFetch<PagedResult<LogisticsRoute>>(listPath("routes", { status: "CLOSED", closedSince, ...ATTENTION_PAGE })),
  ]);
  if (!drafts.ok || !finished.ok || !assigned.ok || !closed.ok) return null;
  return {
    drafts: drafts.data.data,
    routes: [...finished.data.data, ...assigned.data.data, ...closed.data.data],
  };
}

export function LogisticsOverview() {
  const [tab, setTab] = useState<Tab>("routes");
  const [carriers, setCarriers] = useState<Carrier[] | null>(null);
  const [attention, setAttention] = useState<AttentionData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { couriers, nameOf } = useCouriers();
  const now = useNow();
  const [showAllActions, setShowAllActions] = useState(false);

  const load = useCallback(async () => {
    const [carrierResult, attentionResult] = await Promise.all([
      logisticsFetch<{ data: Carrier[] }>("carriers"),
      loadAttention(Date.now()),
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
    if (attentionResult) setAttention(attentionResult);
    setLoadedAt(Date.now());
  }, []);

  /** Reloads the cards and the page shown in the open table. */
  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    void load();
  }, [load]);

  useEffect(() => {
    async function loadInitial() {
      await load();
    }
    void loadInitial();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, refresh]);

  const actions = useMemo(
    () => (attention ? buildActions(attention.drafts, attention.routes, nameOf, now) : []),
    [attention, nameOf, now]
  );

  if (error) return <div className="error-box">{error}</div>;

  const stale = loadedAt !== null && now - loadedAt > STALE_AFTER_MS;

  return (
    <div className="logistics-layout">
      {actions.length > 0 ? (
        <div className="lg-actions">
          {(showAllActions ? actions : actions.slice(0, VISIBLE_ACTIONS)).map((item) => (
            <ActionRequiredCard key={item.id} item={item} />
          ))}
          {actions.length > VISIBLE_ACTIONS ? (
            <button
              className="button-secondary lg-actions-toggle"
              type="button"
              aria-expanded={showAllActions}
              onClick={() => setShowAllActions((value) => !value)}
            >
              {showAllActions ? "Ver menos" : `Ver las ${actions.length} tareas`}
            </button>
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
            <button className="icon-button" type="button" onClick={refresh} aria-label="Actualizar listados">
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
            <RoutesTable nameOf={nameOf} couriers={couriers} refreshKey={refreshKey} />
          ) : (
            <ImportsTable refreshKey={refreshKey} />
          )}
        </div>
      </section>
    </div>
  );
}
