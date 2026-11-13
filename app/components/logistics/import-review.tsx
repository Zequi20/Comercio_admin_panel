"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, Crosshair, MoreHorizontal, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BlockedReason,
  ConfirmImpactDialog,
  StatusPill,
  Stepper,
  type Step,
} from "@/app/components/logistics/logistics-ui";
import {
  describeCountDifference,
  formatDate,
  formatGs,
  logisticsFetch,
  newIdempotencyKey,
  problemMessage,
} from "@/app/lib/logistics/client";
import type { ImportRow, LogisticsRoute, ShipmentImport } from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";
import { loadsOf, toAssignments, type Assignment } from "@/app/lib/logistics/split-suggestion";
import { SheetSettlement } from "@/app/components/logistics/sheet-settlement";
import { StopDistribution } from "@/app/components/logistics/stop-distribution";
import { paginateRows, TablePagination, type TablePaginationState } from "@/app/components/table-pagination";

type RowFilter = "all" | "blocking" | "warnings" | "noLocation" | "duplicates" | "excluded";

const LOCATION_LABEL = {
  COORDINATES: "Coordenadas",
  PLUS_CODE: "Plus code",
  ADDRESS_TEXT: "Solo texto",
} as const;

const ROWS_PAGE_SIZE = 25;

const DUPLICATE_CODES = new Set(["TRACKING_DUPLICATED_IN_FILE", "TRACKING_ALREADY_IMPORTED"]);

/**
 * Observations that ask nothing of the merchant: the guide works as is. They are shown apart, as
 * "para saber", so they do not look like problems.
 */
const INFO_CODES = new Set(["LOCATION_NOT_PRECISE", "SOURCE_ORDER_REPEATED", "FIELD_TOO_LONG"]);

const isBlocking = (row: ImportRow) => row.errors.length > 0;
const reviewWarnings = (row: ImportRow) => row.warnings.filter((issue) => !INFO_CODES.has(issue.code));
const infoWarnings = (row: ImportRow) => row.warnings.filter((issue) => INFO_CODES.has(issue.code));
const needsAttention = (row: ImportRow) => isBlocking(row) || reviewWarnings(row).length > 0;
const hasCode = (row: ImportRow, codes: Set<string> | string) =>
  [...row.errors, ...row.warnings].some((issue) =>
    typeof codes === "string" ? issue.code === codes : codes.has(issue.code)
  );

const FILTERS: Record<RowFilter, { label: string; test: (row: ImportRow) => boolean }> = {
  all: { label: "Todas", test: () => true },
  blocking: { label: "Bloqueantes", test: (row) => isBlocking(row) && !row.excluded },
  warnings: { label: "Con observaciones", test: (row) => !isBlocking(row) && reviewWarnings(row).length > 0 },
  noLocation: { label: "Sin ubicación precisa", test: (row) => hasCode(row, "LOCATION_NOT_PRECISE") },
  duplicates: { label: "Posibles duplicados", test: (row) => hasCode(row, DUPLICATE_CODES) },
  excluded: { label: "Excluidas", test: (row) => row.excluded },
};

function RowStatus({ row }: { row: ImportRow }) {
  if (row.excluded) {
    return (
      <span className="lg-status lg-tone-neutral">
        <CircleSlash size={14} aria-hidden="true" /> Excluida
      </span>
    );
  }
  if (isBlocking(row)) {
    return (
      <span className="lg-status lg-tone-danger">
        <XCircle size={14} aria-hidden="true" /> Bloqueante
      </span>
    );
  }
  if (reviewWarnings(row).length > 0) {
    return (
      <span className="lg-status lg-tone-warning">
        <AlertTriangle size={14} aria-hidden="true" /> Con observaciones
      </span>
    );
  }
  return (
    <span className="lg-status lg-tone-success">
      <CheckCircle2 size={14} aria-hidden="true" /> Lista
    </span>
  );
}

/** An amount the reader could not parse is shown formatted when it is a number, never as "180000". */
const rawAmount = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(String(value).replace(/[^\d-]/g, ""));
  return /\d/.test(String(value)) && Number.isFinite(numeric) ? formatGs(numeric) : String(value);
};

function RowIssues({ row }: { row: ImportRow }) {
  const review = reviewWarnings(row);
  const info = infoWarnings(row);
  return (
    <div className="lg-row-issues">
      {row.errors.length === 0 && review.length === 0 ? (
        <span className="table-muted">Nada para corregir</span>
      ) : (
        <ul className="logistics-issues">
          {row.errors.map((issue, index) => (
            <li className="logistics-issue-error" key={`e-${index}`}>
              <strong>Para corregir:</strong> {issue.message}
            </li>
          ))}
          {review.map((issue, index) => (
            <li className="logistics-issue-warning" key={`w-${index}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {info.length > 0 ? (
        <details className="lg-info-details">
          <summary>Para saber ({info.length})</summary>
          <ul className="logistics-issues">
            {info.map((issue, index) => (
              <li key={`i-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function TotalsComparison({ detail }: { detail: ShipmentImport }) {
  const declared = detail.totals.declared;
  const included = detail.totals.included;
  // Stops are not printed on the sheet the same way, so they are not compared.
  const rows: { key: "amount" | "shipments" | "packages"; label: string; money?: boolean; units?: [string, string] }[] = [
    { key: "amount", label: "Importe a cobrar", money: true },
    { key: "shipments", label: "Guías", units: ["guía", "guías"] },
    { key: "packages", label: "Bultos", units: ["bulto", "bultos"] },
  ];
  const show = (value: number | null | undefined, money?: boolean) =>
    value === null || value === undefined ? "—" : money ? formatGs(value) : String(value);
  const describe = (difference: number, row: (typeof rows)[number]) =>
    row.money
      ? `${formatGs(Math.abs(difference))} ${difference < 0 ? "menos" : "más"} que la planilla`
      : describeCountDifference(difference, row.units![0], row.units![1]);

  return (
    <div className="table-wrap">
      <table className="data-table lg-table lg-no-sticky" style={{ minWidth: 0 }}>
        <caption className="sr-only">Totales de la planilla comparados con lo leído</caption>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Impreso en la planilla</th>
            <th scope="col">Filas incluidas</th>
            <th scope="col">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const declaredValue = declared?.[row.key];
            const difference =
              declaredValue === null || declaredValue === undefined ? null : included[row.key] - declaredValue;
            return (
              <tr key={row.key}>
                <td data-label="Concepto">{row.label}</td>
                <td data-label="Impreso en la planilla">{show(declaredValue, row.money)}</td>
                <td data-label="Filas incluidas">{show(included[row.key], row.money)}</td>
                <td data-label="Diferencia">
                  {difference === null ? (
                    <span className="table-muted">La planilla no lo informa</span>
                  ) : difference === 0 ? (
                    <span className="lg-diff-positive">
                      <CheckCircle2 size={14} aria-hidden="true" /> Coincide
                    </span>
                  ) : (
                    <span className="lg-diff-negative">
                      <AlertTriangle size={14} aria-hidden="true" /> {describe(difference, row)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ImportReview({ importId }: { importId: number }) {
  const router = useRouter();
  const { couriers, nameOf } = useCouriers();
  const [detail, setDetail] = useState<ShipmentImport | null>(null);
  // One courier takes the whole sheet; two or more split its stops (stop key → courier).
  const [courierIds, setCourierIds] = useState<number[]>([]);
  const [assignment, setAssignment] = useState<Assignment>({});
  const [businessDate, setBusinessDate] = useState("");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"discard" | "bulk" | "confirm" | null>(null);
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
  }, [load]);

  const allRows = useMemo(() => detail?.rows ?? [], [detail]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(FILTERS) as RowFilter[]).map((key) => [key, allRows.filter(FILTERS[key].test).length])
      ) as Record<RowFilter, number>,
    [allRows]
  );
  const rows = useMemo(() => allRows.filter(FILTERS[filter].test), [allRows, filter]);
  // A sheet has every row loaded, so they are paged here; a new filter starts at page 1.
  const [rowsPagination, setRowsPagination] = useState<TablePaginationState>({ page: 1, pageSize: ROWS_PAGE_SIZE });
  const rowsPage = useMemo(() => paginateRows(rows, rowsPagination), [rows, rowsPagination]);
  const selectFilter = (next: RowFilter) => {
    setFilter(next);
    setRowsPagination((current) => ({ ...current, page: 1 }));
  };
  const blockingRows = useMemo(() => allRows.filter(FILTERS.blocking.test), [allRows]);
  const split = courierIds.length >= 2;

  if (!detail) {
    return error ? <div className="error-box">{error}</div> : <div className="skeleton table-skeleton" />;
  }

  const isDraft = detail.status === "DRAFT";
  const hasMismatch = detail.totals.mismatches.length > 0;
  const blockedReasons: string[] = [];
  if (blockingRows.length > 0) {
    blockedReasons.push(
      `Hay ${blockingRows.length} ${blockingRows.length === 1 ? "fila bloqueante" : "filas bloqueantes"}: excluilas o corregí el archivo.`
    );
  }
  if (detail.summary.includedRows === 0) blockedReasons.push("No quedó ninguna fila incluida.");
  if (hasMismatch && !acceptMismatch) blockedReasons.push("Confirmá que aceptás la diferencia de totales.");
  const stops = detail.stops ?? [];
  const loads = loadsOf(stops, assignment, courierIds);
  const unassignedStops = split ? stops.filter((stop) => !courierIds.includes(assignment[stop.key])).length : 0;
  if (courierIds.length === 0) blockedReasons.push("Elegí al menos un repartidor.");
  if (unassignedStops > 0) {
    blockedReasons.push(
      unassignedStops === 1
        ? "Queda 1 parada sin repartidor."
        : `Quedan ${unassignedStops} paradas sin repartidor.`
    );
  }
  if (split) {
    for (const load of loads) {
      if (load.stops === 0) blockedReasons.push(`${nameOf(load.courierId)} no tiene paradas: asignale alguna o quitalo.`);
    }
  }

  const problemsResolved = blockingRows.length === 0 && (!hasMismatch || acceptMismatch);
  // Three steps the merchant actually does; steps that are not reachable yet stay gray, not red.
  const steps: Step[] = isDraft
    ? [
        {
          label: "Subir archivo",
          state: "done",
          hint: `${detail.sourceFormat.toUpperCase()} · ${detail.summary.totalRows} filas leídas`,
        },
        {
          label: "Revisar filas",
          state: problemsResolved ? "done" : "current",
          hint: problemsResolved
            ? "Sin bloqueos"
            : blockingRows.length > 0
              ? `${blockingRows.length} ${blockingRows.length === 1 ? "fila bloqueante" : "filas bloqueantes"}`
              : "Aceptá la diferencia de totales",
        },
        {
          label: "Asignar y crear",
          state: problemsResolved ? "current" : "pending",
          hint: !problemsResolved
            ? "Después de revisar las filas"
            : courierIds.length === 0
              ? "Elegí el repartidor"
              : split
                ? `${courierIds.length} repartidores`
                : nameOf(courierIds[0]),
        },
      ]
    : [
        { label: "Subir archivo", state: "done" },
        { label: "Revisar filas", state: "done" },
        {
          label: "Asignar y crear",
          state: detail.status === "CONFIRMED" ? "done" : "pending",
          hint:
            detail.status === "CONFIRMED"
              ? (detail.routeIds?.length ?? 1) > 1
                ? `${detail.routeIds?.length} recorridos creados`
                : "Recorrido creado"
              : "Planilla descartada",
        },
      ];

  const goToFirstError = () => {
    const first = blockingRows[0];
    if (!first) return;
    // Show every row and open the page that holds the first blocking one.
    const index = allRows.findIndex((row) => row.rowNumber === first.rowNumber);
    setFilter("all");
    setRowsPagination((current) => ({ ...current, page: Math.floor(Math.max(index, 0) / current.pageSize) + 1 }));
    setFocusRow(first.rowNumber);
    window.setTimeout(
      () => document.getElementById(`row-${first.rowNumber}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50
    );
  };

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

  const excludeBlocking = async () => {
    setBusy(true);
    setError(null);
    let latest: ShipmentImport | null = null;
    for (const [index, row] of blockingRows.entries()) {
      setBulkProgress(`Excluyendo ${index + 1} de ${blockingRows.length}…`);
      const result = await logisticsFetch<ShipmentImport>(`imports/${importId}/rows/${row.rowNumber}`, {
        method: "PATCH",
        body: { excluded: true },
        idempotencyKey: newIdempotencyKey(),
      });
      if (!result.ok) {
        setError(problemMessage(result.problem, `No se pudo excluir la fila ${row.rowNumber}.`));
        break;
      }
      latest = result.data;
    }
    if (latest) setDetail(latest);
    setBulkProgress(null);
    setBusy(false);
    setDialog(null);
    setConfirmKey(newIdempotencyKey());
  };

  const discard = async () => {
    setBusy(true);
    const result = await logisticsFetch<ShipmentImport>(`imports/${importId}/discard`, {
      method: "POST",
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    setBusy(false);
    setDialog(null);
    if (result.ok) setDetail(result.data);
    else setError(problemMessage(result.problem, "No se pudo descartar."));
  };

  const confirm = async () => {
    if (courierIds.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await logisticsFetch<LogisticsRoute & { routeIds?: number[] }>(`imports/${importId}/confirm`, {
      method: "POST",
      idempotencyKey: confirmKey,
      body: {
        ...(split
          ? { assignments: toAssignments(stops, assignment, courierIds) }
          : { courierId: courierIds[0] }),
        ...(businessDate ? { businessDate } : {}),
        acceptTotalsMismatch: acceptMismatch,
        expectedVersion: detail.version,
      },
    });
    setBusy(false);
    setDialog(null);
    if (result.ok) {
      // One route opens its tracking; a split sheet stays here, where its routes are listed.
      if ((result.data.routeIds?.length ?? 1) > 1) {
        await load();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(`/dashboard/logistica/recorridos/${result.data.id}`);
      }
      return;
    }
    const { code } = result.problem;
    if (
      code === "VERSION_CONFLICT" ||
      code === "IMPORT_HAS_ERRORS" ||
      code === "TRACKING_ALREADY_IMPORTED" ||
      code === "ASSIGNMENT_INVALID"
    ) {
      void load();
    }
    if (code === "IMPORT_ALREADY_CONFIRMED") {
      const routeIds = Array.isArray(result.problem.routeIds) ? (result.problem.routeIds as number[]) : [];
      if (routeIds.length === 1) {
        router.push(`/dashboard/logistica/recorridos/${routeIds[0]}`);
        return;
      }
      void load();
    }
    setConfirmKey(newIdempotencyKey());
    setError(problemMessage(result.problem, "No se pudo crear el recorrido."));
  };

  const amount = detail.totals.included.amount;

  return (
    <div className="logistics-layout">
      <section className="card card-lg logistics-layout">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              Planilla {detail.sheetNumber} · {detail.carrier.name}
            </h2>
            <p className="muted">
              {detail.sheetDate ? `Fecha de la planilla: ${formatDate(detail.sheetDate)}. ` : ""}
              {detail.summary.includedRows} guías incluidas por {formatGs(amount)}.
            </p>
          </div>
          <StatusPill kind="import" status={detail.status} />
        </div>
        <Stepper steps={steps} label="Avance de la importación" />
      </section>

      {!isDraft ? (
        <div className={detail.status === "CONFIRMED" ? "success-box" : "notification-info-box"}>
          {detail.status === "CONFIRMED" ? (
            (detail.routeIds?.length ?? 0) > 1 ? (
              <>Esta planilla se repartió en {detail.routeIds?.length} recorridos: los ves abajo.</>
            ) : (
              <>
                Esta planilla ya creó el recorrido.{" "}
                {detail.routeId ? (
                  <Link href={`/dashboard/logistica/recorridos/${detail.routeId}`}>Ver recorrido</Link>
                ) : null}
              </>
            )
          ) : (
            "Esta importación fue descartada; podés volver a subir la planilla."
          )}
          {detail.piiErased ? " Los datos de destinatarios ya fueron borrados por retención." : ""}
        </div>
      ) : null}

      <section className="card card-lg logistics-layout" aria-labelledby="totals-title">
        <h2 className="card-title" id="totals-title">
          Totales
        </h2>
        <TotalsComparison detail={detail} />
        {hasMismatch ? (
          <div className="lg-alert lg-tone-danger" role="alert">
            <strong>
              <AlertTriangle size={16} aria-hidden="true" /> Las filas incluidas no suman lo mismo que el total
              impreso en la planilla.
            </strong>
            <p>
              Si seguís, el recorrido y la rendición se calculan solo con las filas incluidas, no con el total
              impreso. La diferencia queda registrada en el historial de la importación.
            </p>
            {isDraft ? (
              <label className="logistics-checkbox">
                <input
                  type="checkbox"
                  checked={acceptMismatch}
                  onChange={(event) => setAcceptMismatch(event.target.checked)}
                />
                Revisé la diferencia y la acepto.
              </label>
            ) : null}
          </div>
        ) : null}
        {detail.importWarnings.length > 0 ? (
          <div className="lg-alert lg-alert-soft lg-tone-info">
            {detail.importWarnings.map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
          </div>
        ) : null}
      </section>

      {detail.status === "CONFIRMED" && (detail.routeIds?.length ?? 0) > 0 ? <SheetSettlement importId={importId} /> : null}

      {isDraft ? (
        <section className="card card-lg logistics-layout" aria-labelledby="assign-title">
          <div>
            <h2 className="card-title" id="assign-title">
              Asignar y crear
            </h2>
            <p className="muted">
              Un repartidor lleva toda la planilla. Con dos o más, las paradas se reparten: cada uno recibe su
              propio recorrido y rinde lo suyo.
            </p>
          </div>
          <div className="form-grid">
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
          <StopDistribution
            stops={stops}
            couriers={couriers}
            courierIds={courierIds}
            assignment={assignment}
            disabled={busy}
            onCourierIdsChange={setCourierIds}
            onAssignmentChange={setAssignment}
          />
          {error ? <div className="error-box">{error}</div> : null}
          <div className="form-actions">
            <button className="button-secondary danger-button" type="button" onClick={() => setDialog("discard")} disabled={busy}>
              <Trash2 size={16} aria-hidden="true" /> Descartar planilla
            </button>
            <button
              className="button-primary"
              type="button"
              onClick={() => setDialog("confirm")}
              disabled={busy || blockedReasons.length > 0}
            >
              {split
                ? `Crear ${courierIds.length} recorridos`
                : courierIds.length === 1
                  ? `Asignar a ${nameOf(courierIds[0])} y crear recorrido`
                  : "Asignar y crear recorrido"}
            </button>
          </div>
          {blockedReasons.length > 0 ? (
            <div>
              {blockedReasons.map((reason) => (
                <BlockedReason key={reason}>{reason}</BlockedReason>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card card-lg logistics-layout" aria-labelledby="rows-title">
        <div className="card-header">
          <h2 className="card-title" id="rows-title">
            Filas de la planilla
          </h2>
          {isDraft ? (
            <div className="table-actions">
              <button className="button-secondary" type="button" onClick={goToFirstError} disabled={blockingRows.length === 0}>
                <Crosshair size={16} aria-hidden="true" /> Ir al primer error
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setDialog("bulk")}
                disabled={busy || blockingRows.length === 0}
              >
                Excluir filas bloqueantes ({blockingRows.length})
              </button>
            </div>
          ) : null}
        </div>
        {bulkProgress ? <p className="muted" aria-live="polite">{bulkProgress}</p> : null}
        <div className="lg-filters" role="group" aria-label="Filtrar filas">
          {(Object.keys(FILTERS) as RowFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className="lg-chip"
              aria-pressed={filter === key}
              onClick={() => selectFilter(key)}
            >
              {FILTERS[key].label} · {counts[key]}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="empty-table-state">No hay filas con este filtro.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table lg-table">
              <caption className="sr-only">Filas de la planilla</caption>
              <thead>
                <tr>
                  <th scope="col">Guía</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Destinatario</th>
                  <th scope="col">A cobrar</th>
                  <th scope="col">Qué revisar</th>
                  <th scope="col" className="lg-col-optional">Dirección</th>
                  <th scope="col" className="lg-col-optional">Ubicación</th>
                  <th scope="col" className="lg-col-optional">Fila</th>
                  {isDraft ? <th scope="col"><span className="sr-only">Acción</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rowsPage.rows.map((row) => {
                  const raw = row.raw as Record<string, unknown>;
                  const data = row.normalized;
                  return (
                    <tr
                      key={row.rowNumber}
                      id={`row-${row.rowNumber}`}
                      className={[
                        "lg-row-anchor",
                        row.excluded ? "logistics-row-excluded" : isBlocking(row) ? "logistics-row-error" : "",
                        focusRow === row.rowNumber ? "lg-row-focus" : "",
                      ].join(" ")}
                    >
                      <td data-label="Guía">
                        <strong>{data?.trackingNumber ?? String(raw.trackingNumber ?? "—")}</strong>
                      </td>
                      <td data-label="Estado">
                        <RowStatus row={row} />
                      </td>
                      <td data-label="Destinatario">{data?.recipientName ?? String(raw.recipientName ?? "—")}</td>
                      <td data-label="A cobrar">
                        {data ? formatGs(data.amountToCollect) : rawAmount(raw.amountToCollect)}
                      </td>
                      <td data-label="Qué revisar">
                        <RowIssues row={row} />
                      </td>
                      <td data-label="Dirección" className="lg-col-optional logistics-address-cell">
                        {data?.addressText ?? String(raw.address ?? "—")}
                        {data?.locality ? <span className="table-muted"> · {data.locality}</span> : null}
                      </td>
                      <td data-label="Ubicación" className="lg-col-optional">
                        {data ? LOCATION_LABEL[data.locationSource] : "—"}
                      </td>
                      <td data-label="Fila" className="lg-col-optional">
                        {row.rowNumber}
                      </td>
                      {isDraft ? (
                        <td data-label="">
                          {row.excluded || needsAttention(row) ? (
                            <button className="button-secondary" type="button" disabled={busy} onClick={() => void toggleRow(row)}>
                              {row.excluded ? "Incluir" : "Excluir"}
                            </button>
                          ) : (
                            // Rows without problems rarely need excluding: keep the action out of the way.
                            <details className="lg-row-menu">
                              <summary aria-label={`Más acciones para la fila ${row.rowNumber}`}>
                                <MoreHorizontal size={18} aria-hidden="true" />
                              </summary>
                              <button className="button-secondary" type="button" disabled={busy} onClick={() => void toggleRow(row)}>
                                Excluir fila
                              </button>
                            </details>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 ? (
          <TablePagination
            currentPage={rowsPage.currentPage}
            itemLabelPlural="filas"
            itemLabelSingular="fila"
            pageSize={rowsPage.pageSize}
            totalItems={rowsPage.totalItems}
            totalPages={rowsPage.totalPages}
            onPageChange={(page) => setRowsPagination((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => setRowsPagination({ page: 1, pageSize })}
          />
        ) : null}
      </section>

      <ConfirmImpactDialog
        open={dialog === "confirm"}
        title={split ? "Crear los recorridos" : "Crear el recorrido"}
        tone="progress"
        busy={busy}
        confirmLabel={
          split
            ? `Crear ${courierIds.length} recorridos`
            : courierIds.length === 1
              ? `Asignar a ${nameOf(courierIds[0])}`
              : "Crear recorrido"
        }
        impacts={[
          ...(split
            ? loads.map(
                (load) =>
                  `${nameOf(load.courierId)}: ${load.stops} ${load.stops === 1 ? "parada" : "paradas"}, ${load.shipments} guías, ${formatGs(load.amountToCollect)} a cobrar.`
              )
            : [
                `Se crea un recorrido con ${detail.summary.includedRows} guías por ${formatGs(amount)}${courierIds.length === 1 ? ` para ${nameOf(courierIds[0])}` : ""}.`,
              ]),
          detail.summary.excludedRows > 0
            ? `${detail.summary.excludedRows} filas excluidas quedan fuera: no se van a entregar ni rendir.`
            : "Todas las filas de la planilla quedan incluidas.",
          hasMismatch ? "La diferencia con los totales impresos queda registrada." : "Los totales coinciden con la planilla.",
          split
            ? "Cada repartidor recibe un aviso y confirma que tiene sus paquetes; cada uno rinde lo suyo."
            : "El repartidor recibe un aviso y tiene que confirmar que tiene los paquetes.",
        ]}
        onConfirm={() => void confirm()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmImpactDialog
        open={dialog === "bulk"}
        title={`Excluir ${blockingRows.length} filas bloqueantes`}
        busy={busy}
        confirmLabel="Excluir filas"
        impacts={[
          `${blockingRows.length} guías no van a formar parte del recorrido.`,
          "Podés volver a incluirlas una por una mientras la planilla siga en revisión.",
          "Si las necesitás, corregí el archivo y subilo de nuevo.",
        ]}
        onConfirm={() => void excludeBlocking()}
        onCancel={() => setDialog(null)}
      />
      <ConfirmImpactDialog
        open={dialog === "discard"}
        title="Descartar la planilla"
        tone="danger"
        busy={busy}
        confirmLabel="Descartar"
        impacts={[
          "No se crea ningún recorrido con esta planilla.",
          "Vas a poder volver a subirla más adelante.",
        ]}
        onConfirm={() => void discard()}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
