"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, Crosshair, Trash2, UserCheck, XCircle } from "lucide-react";
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
import { formatGs, logisticsFetch, newIdempotencyKey, problemMessage } from "@/app/lib/logistics/client";
import type { ImportRow, LogisticsRoute, ShipmentImport } from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";

type RowFilter = "all" | "blocking" | "warnings" | "noLocation" | "duplicates" | "excluded";

const LOCATION_LABEL = {
  COORDINATES: "Coordenadas",
  PLUS_CODE: "Plus code",
  ADDRESS_TEXT: "Solo texto",
} as const;

const DUPLICATE_CODES = new Set(["TRACKING_DUPLICATED_IN_FILE", "TRACKING_ALREADY_IMPORTED"]);

const isBlocking = (row: ImportRow) => row.errors.length > 0;
const hasCode = (row: ImportRow, codes: Set<string> | string) =>
  [...row.errors, ...row.warnings].some((issue) =>
    typeof codes === "string" ? issue.code === codes : codes.has(issue.code)
  );

const FILTERS: Record<RowFilter, { label: string; test: (row: ImportRow) => boolean }> = {
  all: { label: "Todas", test: () => true },
  blocking: { label: "Bloqueantes", test: (row) => isBlocking(row) && !row.excluded },
  warnings: { label: "Con observaciones", test: (row) => !isBlocking(row) && row.warnings.length > 0 },
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
  if (row.warnings.length > 0) {
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

function TotalsComparison({ detail }: { detail: ShipmentImport }) {
  const declared = detail.totals.declared;
  const included = detail.totals.included;
  const rows: { key: "amount" | "shipments" | "packages" | "stops"; label: string; money?: boolean; info?: boolean }[] = [
    { key: "amount", label: "Importe", money: true },
    { key: "shipments", label: "Guías" },
    { key: "packages", label: "Bultos" },
    { key: "stops", label: "Paradas", info: true },
  ];
  const show = (value: number | null | undefined, money?: boolean) =>
    value === null || value === undefined ? "—" : money ? formatGs(value) : String(value);

  return (
    <div className="table-wrap">
      <table className="data-table lg-table lg-no-sticky" style={{ minWidth: 0 }}>
        <caption className="sr-only">Totales de la planilla comparados con lo leído</caption>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Planilla</th>
            <th scope="col">Leído (filas incluidas)</th>
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
                <td data-label="Concepto">
                  <span>
                    {row.label}
                    {row.info ? <span className="table-muted"> (informativo)</span> : null}
                  </span>
                </td>
                <td data-label="Planilla">{show(declaredValue, row.money)}</td>
                <td data-label="Leído">{show(included[row.key], row.money)}</td>
                <td data-label="Diferencia">
                  {difference === null ? (
                    "—"
                  ) : difference === 0 ? (
                    <span className="lg-diff-positive">
                      <CheckCircle2 size={14} aria-hidden="true" /> 0
                    </span>
                  ) : (
                    <span className={row.info ? "table-muted" : "lg-diff-negative"}>
                      {!row.info ? <AlertTriangle size={14} aria-hidden="true" /> : null}{" "}
                      {difference > 0 ? "+" : "−"}
                      {show(Math.abs(difference), row.money)}
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
  const { couriers } = useCouriers();
  const [detail, setDetail] = useState<ShipmentImport | null>(null);
  const [courierId, setCourierId] = useState("");
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
  const blockingRows = useMemo(() => allRows.filter(FILTERS.blocking.test), [allRows]);
  const courier = couriers.find((candidate) => String(candidate.id) === courierId) ?? null;

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
  if (!courierId) blockedReasons.push("Elegí el repartidor que va a hacer el recorrido.");

  const problemsResolved = blockingRows.length === 0 && (!hasMismatch || acceptMismatch);
  const steps: Step[] = isDraft
    ? [
        { label: "Cargar archivo", state: "done", hint: `Formato ${detail.sourceFormat}` },
        { label: "Validar datos", state: "done", hint: `${detail.summary.totalRows} filas leídas` },
        {
          label: "Resolver problemas",
          state: problemsResolved ? "done" : "current",
          hint: problemsResolved
            ? "Sin bloqueos"
            : blockingRows.length > 0
              ? `${blockingRows.length} filas bloqueantes`
              : "Aceptá la diferencia de totales",
        },
        {
          label: "Asignar repartidor",
          state: !problemsResolved ? "blocked" : courierId ? "done" : "current",
          hint: !problemsResolved ? "Primero resolvé los problemas" : courier ? courier.name : "Elegí un repartidor",
        },
        {
          label: "Crear recorrido",
          state: blockedReasons.length === 0 ? "current" : "blocked",
          hint: blockedReasons.length === 0 ? "Listo para crear" : "Completá los pasos anteriores",
        },
      ]
    : [
        { label: "Cargar archivo", state: "done" },
        { label: "Validar datos", state: "done" },
        { label: "Resolver problemas", state: "done" },
        { label: "Asignar repartidor", state: detail.status === "CONFIRMED" ? "done" : "blocked" },
        {
          label: "Crear recorrido",
          state: detail.status === "CONFIRMED" ? "done" : "blocked",
          hint: detail.status === "CONFIRMED" ? `Recorrido #${detail.routeId}` : "Importación descartada",
        },
      ];

  const goToFirstError = () => {
    const first = blockingRows[0];
    if (!first) return;
    setFilter("all");
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
    if (!courierId) return;
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
    setDialog(null);
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
              {detail.sheetDate ? `Fecha de la planilla: ${detail.sheetDate}. ` : ""}
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
            <>
              Esta planilla ya creó el recorrido.{" "}
              {detail.routeId ? (
                <Link href={`/dashboard/logistica/recorridos/${detail.routeId}`}>Ver recorrido #{detail.routeId}</Link>
              ) : null}
            </>
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
              <AlertTriangle size={16} aria-hidden="true" /> Lo leído no coincide con el encabezado de la planilla.
            </strong>
            <p>
              Si seguís, el recorrido se crea con las filas incluidas y la rendición se calcula sobre ellas, no sobre
              el total impreso. La diferencia queda registrada en el historial de la importación.
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

      {isDraft ? (
        <section className="card card-lg logistics-layout" aria-labelledby="assign-title">
          <h2 className="card-title" id="assign-title">
            Asignar repartidor y crear recorrido
          </h2>
          <div className="form-grid">
            <label className="field-group">
              <span className="field-label">Repartidor</span>
              <select className="field-control" value={courierId} onChange={(event) => setCourierId(event.target.value)}>
                <option value="">Elegí un repartidor</option>
                {couriers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                    {option.available === false ? " (no disponible)" : ""}
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
          {courier ? (
            <div className="lg-courier-card">
              <strong>
                <UserCheck size={16} aria-hidden="true" /> {courier.name}
              </strong>
              {courier.email ? <span className="table-muted">{courier.email}</span> : null}
              <span>
                {courier.available === false
                  ? "Marcado como no disponible: va a recibir el recorrido igual."
                  : courier.available
                    ? "Disponible"
                    : "Disponibilidad desconocida"}
              </span>
            </div>
          ) : null}
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
              {courier ? `Asignar a ${courier.name} y crear recorrido` : "Asignar y crear recorrido"}
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
              onClick={() => setFilter(key)}
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
                {rows.map((row) => {
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
                        {data ? formatGs(data.amountToCollect) : String(raw.amountToCollect ?? "—")}
                      </td>
                      <td data-label="Qué revisar">
                        {row.errors.length === 0 && row.warnings.length === 0 ? (
                          <span className="table-muted">Nada</span>
                        ) : (
                          <ul className="logistics-issues">
                            {row.errors.map((issue, index) => (
                              <li className="logistics-issue-error" key={`e-${index}`}>
                                <strong>Bloquea:</strong> {issue.message}
                              </li>
                            ))}
                            {row.warnings.map((issue, index) => (
                              <li className="logistics-issue-warning" key={`w-${index}`}>
                                {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
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
                          <button className="button-secondary" type="button" disabled={busy} onClick={() => void toggleRow(row)}>
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
        )}
      </section>

      <ConfirmImpactDialog
        open={dialog === "confirm"}
        title="Crear el recorrido"
        tone="progress"
        busy={busy}
        confirmLabel={courier ? `Asignar a ${courier.name}` : "Crear recorrido"}
        impacts={[
          `Se crea un recorrido con ${detail.summary.includedRows} guías por ${formatGs(amount)}${courier ? ` para ${courier.name}` : ""}.`,
          detail.summary.excludedRows > 0
            ? `${detail.summary.excludedRows} filas excluidas quedan fuera: no se van a entregar ni rendir.`
            : "Todas las filas de la planilla quedan incluidas.",
          hasMismatch ? "La diferencia con los totales impresos queda registrada." : "Los totales coinciden con la planilla.",
          "El repartidor recibe un aviso para confirmar los paquetes.",
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
