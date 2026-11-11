"use client";

import { CheckCircle2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
} from "@/app/lib/logistics/client";
import type { ImportRow, LogisticsRoute, ShipmentImport } from "@/app/lib/logistics/types";

type CourierOption = { id: number | string; name?: string | null; user?: { email?: string; nickname?: string | null } | null };

const TOTAL_LABELS = { amount: "Importe", shipments: "Guías", packages: "Bultos" } as const;

const LOCATION_LABEL = {
  COORDINATES: "Coordenadas",
  PLUS_CODE: "Plus code",
  ADDRESS_TEXT: "Solo texto",
} as const;

const courierLabel = (courier: CourierOption) =>
  courier.name || courier.user?.nickname || courier.user?.email || `Repartidor #${courier.id}`;

function TotalsComparison({ detail }: { detail: ShipmentImport }) {
  const declared = detail.totals.declared;
  const included = detail.totals.included;
  const mismatched = new Set(detail.totals.mismatches.map((mismatch) => mismatch.field));
  const rows: { key: keyof typeof TOTAL_LABELS | "stops"; label: string; money?: boolean }[] = [
    { key: "amount", label: TOTAL_LABELS.amount, money: true },
    { key: "shipments", label: TOTAL_LABELS.shipments },
    { key: "packages", label: TOTAL_LABELS.packages },
    { key: "stops", label: "Paradas (informativo)" },
  ];
  const show = (value: number | null | undefined, money?: boolean) =>
    value === null || value === undefined ? "—" : money ? formatGs(value) : String(value);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Total</th>
            <th>Planilla</th>
            <th>Leído (filas incluidas)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{show(declared?.[row.key], row.money)}</td>
              <td>{show(included[row.key], row.money)}</td>
              <td>
                {row.key !== "stops" && mismatched.has(row.key) ? (
                  <span className="pill error">No coincide</span>
                ) : row.key !== "stops" && declared?.[row.key] != null ? (
                  <span className="pill done">Coincide</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowIssues({ row }: { row: ImportRow }) {
  if (row.errors.length === 0 && row.warnings.length === 0) return <span className="table-muted">—</span>;
  return (
    <ul className="logistics-issues">
      {row.errors.map((issue, index) => (
        <li className="logistics-issue-error" key={`e-${index}`}>
          {issue.message}
        </li>
      ))}
      {row.warnings.map((issue, index) => (
        <li className="logistics-issue-warning" key={`w-${index}`}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function ImportReview({ importId }: { importId: number }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ShipmentImport | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [courierId, setCourierId] = useState("");
  const [businessDate, setBusinessDate] = useState("");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    const result = await logisticsFetch<ShipmentImport>(`imports/${importId}`);
    if (result.ok) {
      setDetail(result.data);
      setBusinessDate((current) => current || result.data.sheetDate || "");
    } else {
      setError(problemMessage(result.problem, "No se pudo cargar la importación."));
    }
  }, [importId]);

  useEffect(() => {
    async function loadInitialImport() {
      await load();
    }

    void loadInitialImport();
    void (async () => {
      const response = await fetch("/api/couriers", { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { data?: CourierOption[] } | null;
      setCouriers(body?.data ?? []);
    })();
  }, [load]);

  const rows = useMemo(
    () =>
      (detail?.rows ?? []).filter(
        (row) => !onlyProblems || row.errors.length > 0 || row.warnings.length > 0
      ),
    [detail, onlyProblems]
  );

  const toggleRow = async (row: ImportRow) => {
    setBusy(true);
    const result = await logisticsFetch<ShipmentImport>(`imports/${importId}/rows/${row.rowNumber}`, {
      method: "PATCH",
      body: { excluded: !row.excluded },
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    if (result.ok) {
      setDetail(result.data);
      setConfirmKey(newIdempotencyKey());
    } else {
      setError(problemMessage(result.problem, "No se pudo actualizar la fila."));
    }
  };

  const discard = async () => {
    if (!window.confirm("¿Descartar esta importación? No se creará ningún recorrido.")) return;
    setBusy(true);
    const result = await logisticsFetch<ShipmentImport>(`imports/${importId}/discard`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    if (result.ok) setDetail(result.data);
    else setError(problemMessage(result.problem, "No se pudo descartar."));
  };

  const confirm = async () => {
    if (!detail || !courierId) return;
    setBusy(true);
    setError(null);
    const result = await logisticsFetch<LogisticsRoute>(`imports/${importId}/confirm`, {
      method: "POST",
      idempotencyKey: confirmKey,
      body: {
        courierId: Number(courierId),
        ...(businessDate ? { businessDate } : {}),
        acceptTotalsMismatch: acceptMismatch,
        expectedVersion: detail.version,
      },
    });
    setBusy(false);
    if (result.ok) {
      router.push(`/dashboard/logistica/recorridos/${result.data.id}`);
      return;
    }
    const { code } = result.problem;
    if (code === "VERSION_CONFLICT" || code === "IMPORT_HAS_ERRORS" || code === "TRACKING_ALREADY_IMPORTED") {
      void load();
    }
    if (code === "IMPORT_ALREADY_CONFIRMED" && typeof result.problem.routeId === "number") {
      router.push(`/dashboard/logistica/recorridos/${result.problem.routeId}`);
      return;
    }
    setConfirmKey(newIdempotencyKey());
    setError(problemMessage(result.problem, "No se pudo confirmar la planilla."));
  };

  if (!detail) {
    return error ? <div className="error-box">{error}</div> : <div className="skeleton table-skeleton" />;
  }

  const isDraft = detail.status === "DRAFT";
  const hasMismatch = detail.totals.mismatches.length > 0;

  return (
    <div className="logistics-layout">
      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Filas</span>
          <strong className="stat-value">{detail.summary.totalRows}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Con errores</span>
          <strong className="stat-value">{detail.summary.rowsWithErrors}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Con advertencias</span>
          <strong className="stat-value">{detail.summary.rowsWithWarnings}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Excluidas</span>
          <strong className="stat-value">{detail.summary.excludedRows}</strong>
        </div>
      </section>

      <section className="card card-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Planilla {detail.sheetNumber} · {detail.carrier.name}
            </h2>
            <p className="muted">
              {detail.sheetDate ? `Fecha de la planilla: ${detail.sheetDate}. ` : ""}
              Formato {detail.sourceFormat}.
            </p>
          </div>
          {detail.routeId ? (
            <Link className="button-secondary" href={`/dashboard/logistica/recorridos/${detail.routeId}`}>
              Ver recorrido #{detail.routeId}
            </Link>
          ) : null}
        </div>
        <TotalsComparison detail={detail} />
        {detail.importWarnings.length > 0 ? (
          <div className="notification-info-box">
            {detail.importWarnings.map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
          </div>
        ) : null}
      </section>

      {isDraft ? (
        <section className="card card-lg">
          <h2 className="card-title">Confirmar y crear el recorrido</h2>
          <div className="form-grid">
            <label className="field-group">
              <span className="field-label">Repartidor</span>
              <select
                className="field-control"
                value={courierId}
                onChange={(event) => setCourierId(event.target.value)}
              >
                <option value="">Elegí un repartidor</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courierLabel(courier)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Fecha del recorrido</span>
              <input
                className="field-control"
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
              />
            </label>
          </div>
          {hasMismatch ? (
            <label className="logistics-checkbox">
              <input
                type="checkbox"
                checked={acceptMismatch}
                onChange={(event) => setAcceptMismatch(event.target.checked)}
              />
              Los totales no coinciden con el encabezado de la planilla y lo acepto.
            </label>
          ) : null}
          {error ? <div className="error-box">{error}</div> : null}
          <div className="form-actions">
            <button className="button-secondary danger-button" type="button" onClick={discard} disabled={busy}>
              <Trash2 size={16} /> Descartar
            </button>
            <button
              className="button-primary"
              type="button"
              onClick={confirm}
              disabled={busy || !detail.canConfirm || !courierId || (hasMismatch && !acceptMismatch)}
            >
              <CheckCircle2 size={16} /> Crear recorrido con {detail.summary.includedRows} guías
            </button>
          </div>
          {!detail.canConfirm ? (
            <p className="field-help">
              Hay filas incluidas con errores. Corregí el archivo y volvé a importarlo, o excluí esas filas.
            </p>
          ) : null}
        </section>
      ) : (
        <div className={detail.status === "CONFIRMED" ? "success-box" : "notification-info-box"}>
          {detail.status === "CONFIRMED"
            ? "Esta planilla ya fue confirmada."
            : "Esta importación fue descartada; podés volver a subir la planilla."}
          {detail.piiErased ? " Los datos de destinatarios ya fueron borrados por retención." : ""}
        </div>
      )}

      <section className="card card-lg">
        <div className="card-header">
          <h2 className="card-title">Filas</h2>
          <label className="logistics-checkbox">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(event) => setOnlyProblems(event.target.checked)}
            />
            Solo con problemas
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Orden</th>
                <th>Guía</th>
                <th>Remitente</th>
                <th>Destinatario</th>
                <th>Dirección</th>
                <th>Ubicación</th>
                <th>Bultos</th>
                <th>A cobrar</th>
                <th>Observaciones</th>
                {isDraft ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const raw = row.raw as Record<string, unknown>;
                const data = row.normalized;
                return (
                  <tr
                    key={row.rowNumber}
                    className={
                      row.excluded ? "logistics-row-excluded" : row.errors.length > 0 ? "logistics-row-error" : undefined
                    }
                  >
                    <td>{row.rowNumber}</td>
                    <td>{row.sourceOrder ?? "—"}</td>
                    <td>{data?.trackingNumber ?? String(raw.trackingNumber ?? "—")}</td>
                    <td>{data?.senderName ?? "—"}</td>
                    <td>{data?.recipientName ?? String(raw.recipientName ?? "—")}</td>
                    <td className="logistics-address-cell">
                      {data?.addressText ?? String(raw.address ?? "—")}
                      {data?.locality ? <span className="table-muted"> · {data.locality}</span> : null}
                    </td>
                    <td>{data ? LOCATION_LABEL[data.locationSource] : "—"}</td>
                    <td>{data?.packages ?? String(raw.packages ?? "—")}</td>
                    <td>{data ? formatGs(data.amountToCollect) : String(raw.amountToCollect ?? "—")}</td>
                    <td>
                      <RowIssues row={row} />
                    </td>
                    {isDraft ? (
                      <td>
                        <button
                          className="button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleRow(row)}
                        >
                          {row.excluded ? "Incluir" : "Excluir"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
