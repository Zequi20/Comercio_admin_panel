"use client";

import { Download, FileUp, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  formatDateTime,
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
  ROUTE_STATUS_LABEL,
  statusPillClass,
} from "@/app/lib/logistics/client";
import type {
  Carrier,
  ImportStatus,
  LogisticsRoute,
  RouteStatus,
  ShipmentImport,
} from "@/app/lib/logistics/types";

type Tab = "routes" | "imports";

const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  DISCARDED: "Descartada",
};

function UploadSheet({ carriers }: { carriers: Carrier[] }) {
  const router = useRouter();
  const [carrierId, setCarrierId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingImportId, setExistingImportId] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const selectedCarrierId = carrierId || (carriers[0] ? String(carriers[0].id) : "");

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
      setError(problemMessage(body, "No se pudo importar la planilla."));
      // A rejected upload is not retried with the same key: the next attempt is a new request.
      setIdempotencyKey(newIdempotencyKey());
    } catch {
      setError("No hay conexión con el portal. Reintentá; no se duplicará la carga.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card card-lg">
      <div className="card-header">
        <div>
          <h2 className="card-title">Importar planilla de recorrido</h2>
          <p className="muted">
            Subí la planilla en la plantilla de Y4pido (.xlsx o .csv). Antes de crear el recorrido
            vas a poder revisar cada fila y los totales.
          </p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => window.location.assign("/api/logistics/template")}
        >
          <Download size={16} /> Descargar plantilla
        </button>
      </div>
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
            accept=".xlsx,.csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setIdempotencyKey(newIdempotencyKey());
            }}
            required
          />
        </label>
        <div className="form-actions">
          <button className="button-primary" type="submit" disabled={sending || !file || !selectedCarrierId}>
            <FileUp size={16} /> {sending ? "Leyendo planilla…" : "Revisar planilla"}
          </button>
        </div>
      </form>
      {error ? (
        <div className="error-box" role="alert">
          {error}{" "}
          {existingImportId ? (
            <Link href={`/dashboard/logistica/importaciones/${existingImportId}`}>
              Ver la carga anterior
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RoutesTable() {
  const [routes, setRoutes] = useState<LogisticsRoute[] | null>(null);
  const [status, setStatus] = useState<RouteStatus | "">("");
  const [businessDate, setBusinessDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "50" });
    if (status) params.set("status", status);
    if (businessDate) params.set("businessDate", businessDate);
    const result = await logisticsFetch<{ data: LogisticsRoute[] }>(`routes?${params}`);
    if (result.ok) {
      setRoutes(result.data.data);
      setError(null);
    } else {
      setError(problemMessage(result.problem, "No se pudieron cargar los recorridos."));
    }
  }, [status, businessDate]);

  useEffect(() => {
    async function loadInitialRoutes() {
      await load();
    }

    void loadInitialRoutes();
  }, [load]);

  return (
    <section className="card card-lg">
      <div className="card-header">
        <h2 className="card-title">Recorridos</h2>
        <button className="icon-button" type="button" onClick={() => void load()} aria-label="Actualizar">
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="catalog-filters orders-filters">
        <label className="field-group">
          <span className="field-label">Estado</span>
          <select
            className="field-control"
            value={status}
            onChange={(event) => setStatus(event.target.value as RouteStatus | "")}
          >
            <option value="">Todos</option>
            {Object.entries(ROUTE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
            onChange={(event) => setBusinessDate(event.target.value)}
          />
        </label>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {routes === null ? (
        <div className="skeleton table-skeleton" />
      ) : routes.length === 0 ? (
        <p className="empty-table-state">No hay recorridos con estos filtros.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recorrido</th>
                <th>Fecha</th>
                <th>Planilla</th>
                <th>Repartidor</th>
                <th>Estado</th>
                <th>Avance</th>
                <th>Cobrado / esperado</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => {
                const done = route.summary.shipments - route.summary.pending;
                return (
                  <tr key={route.id}>
                    <td>
                      <Link href={`/dashboard/logistica/recorridos/${route.id}`}>#{route.id}</Link>
                    </td>
                    <td>{route.businessDate}</td>
                    <td>
                      {route.carrier.name} · {route.import.sheetNumber}
                    </td>
                    <td>#{route.courierId}</td>
                    <td>
                      <span className={statusPillClass(route.status)}>
                        {ROUTE_STATUS_LABEL[route.status]}
                      </span>
                    </td>
                    <td>
                      {done}/{route.summary.shipments} guías
                    </td>
                    <td>
                      {formatGs(route.summary.collectedAmount)} /{" "}
                      <span className="table-muted">
                        {formatGs(route.summary.deliveredExpectedAmount)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ImportsTable() {
  const [imports, setImports] = useState<ShipmentImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await logisticsFetch<{ data: ShipmentImport[] }>("imports?limit=50");
      if (result.ok) setImports(result.data.data);
      else setError(problemMessage(result.problem, "No se pudieron cargar las importaciones."));
    })();
  }, []);

  return (
    <section className="card card-lg">
      <div className="card-header">
        <h2 className="card-title">Importaciones</h2>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {imports === null ? (
        <div className="skeleton table-skeleton" />
      ) : imports.length === 0 ? (
        <p className="empty-table-state">Todavía no se importó ninguna planilla.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Planilla</th>
                <th>Empresa</th>
                <th>Cargada</th>
                <th>Estado</th>
                <th>Filas</th>
                <th>Con errores</th>
                <th>Recorrido</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/dashboard/logistica/importaciones/${item.id}`}>
                      {item.sheetNumber}
                    </Link>
                  </td>
                  <td>{item.carrier.name}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <span className={item.status === "CONFIRMED" ? "pill done" : "pill"}>
                      {IMPORT_STATUS_LABEL[item.status]}
                    </span>
                  </td>
                  <td>{item.summary.totalRows}</td>
                  <td>{item.summary.rowsWithErrors}</td>
                  <td>
                    {item.routeId ? (
                      <Link href={`/dashboard/logistica/recorridos/${item.routeId}`}>#{item.routeId}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LogisticsOverview() {
  const [tab, setTab] = useState<Tab>("routes");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await logisticsFetch<{ data: Carrier[] }>("carriers");
      if (result.ok) setCarriers(result.data.data);
      else
        setError(
          result.status === 404
            ? "El módulo de logística no está habilitado en el servicio de pedidos."
            : problemMessage(result.problem, "No se pudo conectar con logística.")
        );
    })();
  }, []);

  if (error) return <div className="error-box">{error}</div>;

  return (
    <div className="logistics-layout">
      <UploadSheet carriers={carriers} />
      <div className="logistics-tabs" role="tablist">
        <button
          className={tab === "routes" ? "button-tonal" : "button-secondary"}
          role="tab"
          aria-selected={tab === "routes"}
          type="button"
          onClick={() => setTab("routes")}
        >
          Recorridos
        </button>
        <button
          className={tab === "imports" ? "button-tonal" : "button-secondary"}
          role="tab"
          aria-selected={tab === "imports"}
          type="button"
          onClick={() => setTab("imports")}
        >
          Importaciones
        </button>
      </div>
      {tab === "routes" ? <RoutesTable /> : <ImportsTable />}
    </div>
  );
}
