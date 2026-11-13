"use client";

import { Sparkles, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { paginateRows, TablePagination, type TablePaginationState } from "@/app/components/table-pagination";
import { formatGs } from "@/app/lib/logistics/client";
import {
  loadsOf,
  localityOf,
  suggestSplit,
  type Assignment,
  type SplitMethod,
} from "@/app/lib/logistics/split-suggestion";
import type { DraftStop } from "@/app/lib/logistics/types";
import type { CourierOption } from "@/app/lib/logistics/use-couriers";

const STOPS_PAGE_SIZE = 25;
const UNASSIGNED = "unassigned";

const METHOD_LABEL: Record<SplitMethod, { label: string; hint: string }> = {
  locality: {
    label: "Por localidad",
    hint: "Mantiene juntas las paradas de cada localidad; una localidad grande se reparte entre varios para que nadie quede sobrecargado.",
  },
  balanced: {
    label: "Partes iguales",
    hint: "Tramos seguidos de la planilla con una cantidad parecida de guías para cada uno.",
  },
};

/**
 * Splits the stops of a sheet among couriers. With one courier every stop goes to them; with two or
 * more the merchant gets a suggestion and moves stops by hand, row by row or several at once.
 */
export function StopDistribution({
  stops,
  couriers,
  courierIds,
  assignment,
  disabled,
  onCourierIdsChange,
  onAssignmentChange,
}: {
  stops: DraftStop[];
  couriers: CourierOption[];
  courierIds: number[];
  assignment: Assignment;
  disabled?: boolean;
  onCourierIdsChange: (courierIds: number[]) => void;
  onAssignmentChange: (assignment: Assignment) => void;
}) {
  const [candidate, setCandidate] = useState("");
  const [method, setMethod] = useState<SplitMethod>("locality");
  const [notice, setNotice] = useState<string | null>(null);
  const [locality, setLocality] = useState("");
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [pagination, setPagination] = useState<TablePaginationState>({ page: 1, pageSize: STOPS_PAGE_SIZE });

  const nameOf = (id: number) => couriers.find((courier) => courier.id === id)?.name ?? `Repartidor #${id}`;
  const split = courierIds.length >= 2;
  const localities = useMemo(
    () => Array.from(new Set(stops.map(localityOf))).sort((a, b) => a.localeCompare(b)),
    [stops]
  );
  const loads = loadsOf(stops, assignment, courierIds);
  const unassigned = split ? stops.filter((stop) => !courierIds.includes(assignment[stop.key])) : [];

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return stops.filter((stop) => {
      const current = assignment[stop.key];
      return (
        (!locality || localityOf(stop) === locality) &&
        (!owner ||
          (owner === UNASSIGNED ? !courierIds.includes(current) : String(current) === owner)) &&
        (!text || `${stop.sequence} ${stop.addressText ?? ""} ${stop.locality ?? ""}`.toLowerCase().includes(text))
      );
    });
  }, [stops, assignment, courierIds, locality, owner, query]);
  const page = paginateRows(visible, pagination);
  const visibleKeys = visible.map((stop) => stop.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key));

  const changeFilter = (apply: () => void) => {
    apply();
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const applySuggestion = (ids: number[], how: SplitMethod) => {
    onAssignmentChange(suggestSplit(stops, ids, how));
    setSelected(new Set());
    setNotice(`Reparto sugerido ${METHOD_LABEL[how].label.toLowerCase()}. Podés mover paradas a mano.`);
  };

  const addCourier = () => {
    const id = Number(candidate);
    if (!id || courierIds.includes(id)) return;
    const next = [...courierIds, id];
    setCandidate("");
    onCourierIdsChange(next);
    // Going from one courier to two starts from a suggestion; later additions keep the manual work.
    const nothingAssigned = stops.every((stop) => !courierIds.includes(assignment[stop.key]));
    if (next.length >= 2 && (courierIds.length < 2 || nothingAssigned)) {
      applySuggestion(next, method);
    } else if (next.length >= 2) {
      setNotice(`${nameOf(id)} todavía no tiene paradas: tocá «Sugerir reparto» o asignale paradas a mano.`);
    }
  };

  const removeCourier = (id: number) => {
    const next = courierIds.filter((courierId) => courierId !== id);
    onCourierIdsChange(next);
    const kept: Assignment = {};
    if (next.length >= 2) {
      for (const [key, courierId] of Object.entries(assignment)) {
        if (courierId !== id) kept[key] = courierId;
      }
    }
    onAssignmentChange(kept);
    if (next.length >= 2 && Object.values(assignment).includes(id)) {
      setNotice(`Las paradas de ${nameOf(id)} quedaron sin repartidor.`);
    } else {
      setNotice(null);
    }
  };

  const assign = (keys: string[], courierId: number | null) => {
    const next = { ...assignment };
    for (const key of keys) {
      if (courierId === null) delete next[key];
      else next[key] = courierId;
    }
    onAssignmentChange(next);
  };

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const available = couriers.filter((courier) => !courierIds.includes(courier.id));

  return (
    <div className="logistics-layout">
      <div className="lg-split-couriers">
        <span className="field-label" id="split-couriers-label">
          Repartidores
        </span>
        {courierIds.length === 0 ? (
          <p className="muted">Agregá uno o más repartidores. Con más de uno, las paradas se reparten entre ellos.</p>
        ) : (
          <ul className="lg-split-chips" aria-labelledby="split-couriers-label">
            {courierIds.map((id) => {
              const courier = couriers.find((option) => option.id === id);
              return (
                <li key={id} className="lg-split-chip">
                  <span>
                    <strong>{nameOf(id)}</strong>
                    {courier?.available === false ? <span className="table-muted"> · no disponible</span> : null}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Quitar a ${nameOf(id)}`}
                    disabled={disabled}
                    onClick={() => removeCourier(id)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="lg-split-add">
          <select
            className="field-control"
            aria-label="Repartidor para agregar"
            value={candidate}
            disabled={disabled || available.length === 0}
            onChange={(event) => setCandidate(event.target.value)}
          >
            <option value="">{courierIds.length === 0 ? "Elegí un repartidor" : "Agregar otro repartidor"}</option>
            {available.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.available === false ? " (no disponible)" : ""}
              </option>
            ))}
          </select>
          <button className="button-secondary" type="button" disabled={disabled || !candidate} onClick={addCourier}>
            <UserPlus size={16} aria-hidden="true" /> Agregar
          </button>
        </div>
      </div>

      {courierIds.length === 1 ? (
        <p className="lg-info-note lg-tone-info" role="status">
          Las {stops.length} paradas van a {nameOf(courierIds[0])}. Agregá otro repartidor para repartir la planilla.
        </p>
      ) : null}

      {split ? (
        <>
          <div className="lg-split-suggest">
            <fieldset className="lg-split-methods" disabled={disabled}>
              <legend className="field-label">Sugerir reparto</legend>
              {(Object.keys(METHOD_LABEL) as SplitMethod[]).map((key) => (
                <label key={key} className="lg-split-method">
                  <input
                    type="radio"
                    name="split-method"
                    value={key}
                    checked={method === key}
                    onChange={() => setMethod(key)}
                  />
                  <span>
                    <strong>{METHOD_LABEL[key].label}</strong>
                    <span className="lg-split-method-hint">{METHOD_LABEL[key].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              className="button-secondary"
              type="button"
              disabled={disabled}
              onClick={() => applySuggestion(courierIds, method)}
            >
              <Sparkles size={16} aria-hidden="true" /> Sugerir reparto
            </button>
          </div>
          {notice ? (
            <p className="lg-info-note lg-tone-info" role="status">
              {notice}
            </p>
          ) : null}

          <div className="lg-metrics" aria-label="Carga de cada repartidor">
            {loads.map((load) => (
              <div key={load.courierId} className={`lg-metric lg-tone-${load.stops === 0 ? "warning" : "neutral"}`}>
                <span className="lg-metric-label">{nameOf(load.courierId)}</span>
                <strong className="lg-metric-value">
                  {load.stops} {load.stops === 1 ? "parada" : "paradas"}
                </strong>
                <span className="lg-metric-hint">
                  {load.shipments} guías · {load.packages} bultos · {formatGs(load.amountToCollect)}
                </span>
              </div>
            ))}
            {unassigned.length > 0 ? (
              <div className="lg-metric lg-tone-danger">
                <span className="lg-metric-label">Sin repartidor</span>
                <strong className="lg-metric-value">
                  {unassigned.length} {unassigned.length === 1 ? "parada" : "paradas"}
                </strong>
                <span className="lg-metric-hint">Asignalas para poder crear los recorridos.</span>
              </div>
            ) : null}
          </div>

          <div className="catalog-filters orders-filters">
            <label className="field-group">
              <span className="field-label">Buscar parada</span>
              <input
                className="field-control"
                type="search"
                placeholder="N.º de parada o dirección"
                value={query}
                onChange={(event) => changeFilter(() => setQuery(event.target.value))}
              />
            </label>
            <label className="field-group">
              <span className="field-label">Localidad</span>
              <select className="field-control" value={locality} onChange={(event) => changeFilter(() => setLocality(event.target.value))}>
                <option value="">Todas</option>
                {localities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Repartidor</span>
              <select className="field-control" value={owner} onChange={(event) => changeFilter(() => setOwner(event.target.value))}>
                <option value="">Todos</option>
                <option value={UNASSIGNED}>Sin repartidor</option>
                {courierIds.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lg-split-bulk" role="group" aria-label="Asignar varias paradas">
            <span className="muted">
              {selected.size} {selected.size === 1 ? "parada seleccionada" : "paradas seleccionadas"}
            </span>
            <select
              className="field-control"
              aria-label="Repartidor para las paradas seleccionadas"
              value={bulkTarget}
              disabled={disabled}
              onChange={(event) => setBulkTarget(event.target.value)}
            >
              <option value="">Elegí a quién</option>
              {courierIds.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
            <button
              className="button-secondary"
              type="button"
              disabled={disabled || selected.size === 0 || !bulkTarget}
              onClick={() => {
                assign(Array.from(selected), Number(bulkTarget));
                setSelected(new Set());
              }}
            >
              Asignar seleccionadas
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="empty-table-state">No hay paradas con este filtro.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table lg-table lg-no-sticky">
                  <caption className="sr-only">Paradas de la planilla y su repartidor</caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas las paradas del filtro"
                          checked={allVisibleSelected}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              for (const key of visibleKeys) {
                                if (allVisibleSelected) next.delete(key);
                                else next.add(key);
                              }
                              return next;
                            })
                          }
                        />
                      </th>
                      <th scope="col">Parada</th>
                      <th scope="col">Dirección</th>
                      <th scope="col">Localidad</th>
                      <th scope="col">Guías</th>
                      <th scope="col" className="lg-col-optional">A cobrar</th>
                      <th scope="col">Repartidor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((stop) => {
                      const current = assignment[stop.key];
                      const assigned = courierIds.includes(current);
                      return (
                        <tr key={stop.key} className={assigned ? undefined : "lg-split-unassigned"}>
                          <td data-label="">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar la parada ${stop.sequence}`}
                              checked={selected.has(stop.key)}
                              onChange={() => toggle(stop.key)}
                            />
                          </td>
                          <td data-label="Parada">
                            <strong>{stop.sequence}</strong>
                          </td>
                          <td data-label="Dirección" className="logistics-address-cell">
                            {stop.addressText ?? "Sin dirección"}
                          </td>
                          <td data-label="Localidad">{localityOf(stop)}</td>
                          <td data-label="Guías">{stop.shipments}</td>
                          <td data-label="A cobrar" className="lg-col-optional">{formatGs(stop.amountToCollect)}</td>
                          <td data-label="Repartidor">
                            <select
                              className="field-control"
                              aria-label={`Repartidor de la parada ${stop.sequence}`}
                              value={assigned ? String(current) : ""}
                              disabled={disabled}
                              onChange={(event) =>
                                assign([stop.key], event.target.value ? Number(event.target.value) : null)
                              }
                            >
                              <option value="">Sin repartidor</option>
                              {courierIds.map((id) => (
                                <option key={id} value={id}>
                                  {nameOf(id)}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={page.currentPage}
                itemLabelPlural="paradas"
                itemLabelSingular="parada"
                pageSize={page.pageSize}
                totalItems={page.totalItems}
                totalPages={page.totalPages}
                onPageChange={(next) => setPagination((current) => ({ ...current, page: next }))}
                onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
              />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
