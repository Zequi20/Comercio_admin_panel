"use client";

import { Banknote, CheckCircle2, Download, PackageX, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { InfoNote, MetricCard, MoneyDifferenceCard, StatusPill } from "@/app/components/logistics/logistics-ui";
import { describeMoneyDifference, formatGs, logisticsFetch, problemMessage } from "@/app/lib/logistics/client";
import type { ImportSettlement } from "@/app/lib/logistics/types";
import { useCouriers } from "@/app/lib/logistics/use-couriers";

/**
 * A confirmed sheet: its routes (one per courier when it was split) and the sheet settlement, which
 * adds them up as the carrier settles the whole sheet. Open routes count with live figures.
 */
export function SheetSettlement({ importId }: { importId: number }) {
  const { nameOf } = useCouriers();
  const [sheet, setSheet] = useState<ImportSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await logisticsFetch<ImportSettlement>(`imports/${importId}/settlement`);
      if (!active) return;
      if (result.ok) setSheet(result.data);
      else setError(problemMessage(result.problem, "No se pudo cargar la rendición de la planilla."));
    }
    void load();
    return () => {
      active = false;
    };
  }, [importId]);

  if (error) return <div className="error-box">{error}</div>;
  if (!sheet) return <div className="skeleton table-skeleton" />;

  const { snapshot } = sheet;
  const split = sheet.routes.length > 1;
  const open = sheet.routes.filter((part) => !part.final).length;

  return (
    <section className="card card-lg logistics-layout" aria-labelledby="sheet-routes-title">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="sheet-routes-title">
            {split ? `Recorridos de la planilla (${sheet.routes.length})` : "Recorrido de la planilla"}
          </h2>
          <p className="muted">
            {split
              ? `La planilla se repartió entre ${sheet.routes.length} repartidores. Cada uno rinde lo suyo; abajo está el total para conciliar con ${sheet.carrierName}.`
              : `Total para conciliar con ${sheet.carrierName}.`}
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table lg-table">
          <caption className="sr-only">Recorridos de la planilla</caption>
          <thead>
            <tr>
              <th scope="col">Repartidor</th>
              <th scope="col">Estado</th>
              <th scope="col">Guías</th>
              <th scope="col" className="lg-col-optional">Entregadas</th>
              <th scope="col">Cobrado</th>
              <th scope="col" className="lg-col-optional">Diferencia</th>
              <th scope="col"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {sheet.routes.map((part) => (
              <tr key={part.routeId}>
                <td data-label="Repartidor">
                  <span>
                    <strong>{nameOf(part.courierId)}</strong>
                    <span className="table-muted"> · recorrido #{part.routeId}</span>
                  </span>
                </td>
                <td data-label="Estado">
                  <StatusPill kind="route" status={part.status} />
                </td>
                <td data-label="Guías">{part.counts.shipments}</td>
                <td data-label="Entregadas" className="lg-col-optional">{part.counts.delivered}</td>
                <td data-label="Cobrado">
                  <span>
                    {formatGs(part.collectedAmount)}
                    <span className="lg-cell-note">de {formatGs(part.expectedAmount)} a cobrar por lo entregado</span>
                  </span>
                </td>
                <td
                  data-label="Diferencia"
                  className={`lg-col-optional${part.differenceAmount !== 0 ? " lg-diff-negative" : ""}`}
                >
                  {describeMoneyDifference(part.differenceAmount)}
                </td>
                <td data-label="">
                  <Link className="button-secondary" href={`/dashboard/logistica/recorridos/${part.routeId}`}>
                    Ver recorrido
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheet.closed ? (
        <InfoNote tone="success" icon={CheckCircle2}>
          Todos los recorridos están cerrados: la rendición de la planilla es final.
        </InfoNote>
      ) : (
        <InfoNote tone="info">
          {open} {open === 1 ? "recorrido sigue abierto" : "recorridos siguen abiertos"}: los totales todavía pueden
          cambiar.
        </InfoNote>
      )}

      <div className="lg-metrics">
        <MetricCard
          label="Entregadas"
          value={snapshot.counts.delivered}
          tone="success"
          icon={CheckCircle2}
          hint={`de ${snapshot.counts.shipments} guías`}
        />
        <MetricCard
          label="Para devolver"
          value={snapshot.counts.returnPending}
          tone="neutral"
          icon={Undo2}
          hint={`Vuelven a ${sheet.carrierName}`}
        />
        <MetricCard
          label="No recibidas"
          value={snapshot.counts.missing}
          tone={snapshot.counts.missing > 0 ? "warning" : "neutral"}
          icon={PackageX}
        />
        <MetricCard
          label="Cobrado"
          value={formatGs(snapshot.collectedAmount)}
          tone="neutral"
          icon={Banknote}
          hint={`De ${formatGs(snapshot.expectedAmount)} a cobrar por lo entregado`}
        />
        <MoneyDifferenceCard expected={snapshot.expectedAmount} collected={snapshot.collectedAmount} />
      </div>

      <div className="form-actions">
        <a className="button-primary" href={`/api/logistics/imports/${importId}/export?format=xlsx`}>
          <Download size={16} aria-hidden="true" /> Descargar rendición de la planilla (Excel)
        </a>
        <a className="button-secondary" href={`/api/logistics/imports/${importId}/export?format=csv`}>
          <Download size={16} aria-hidden="true" /> Descargar CSV
        </a>
      </div>
    </section>
  );
}
