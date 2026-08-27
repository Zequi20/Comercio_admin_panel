import { Medal, Trophy, Truck } from "lucide-react";

import type { MonthlyCourierRanking } from "@/app/lib/courier-ranking";

function completedOrdersLabel(count: number) {
  return `${count} ${count === 1 ? "pedido completado" : "pedidos completados"}`;
}

export function MonthlyCourierRankingCard({
  ranking,
  description,
  isLoading = false,
  compact = false,
}: {
  ranking: MonthlyCourierRanking | null;
  description: string;
  isLoading?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Ranking mensual de repartidores"
      className={`card card-lg courier-ranking-card${
        compact ? " courier-ranking-card-compact" : ""
      }`}
    >
      <div className="card-header">
        <div>
          <h2 className="card-title">Ranking mensual</h2>
          <p className="muted">{description}</p>
        </div>
        {ranking ? (
          <span className="pill confirmed">{ranking.monthLabel}</span>
        ) : null}
      </div>

      {isLoading ? (
        <div aria-label="Cargando ranking" className="courier-ranking-loading">
          {Array.from({ length: compact ? 3 : 5 }).map((_, index) => (
            <span className="skeleton table-skeleton" key={index} />
          ))}
        </div>
      ) : ranking?.entries.length ? (
        <ol className="courier-ranking-list">
          {ranking.entries.map((entry) => (
            <li className="courier-ranking-row" key={entry.courierId}>
              <span
                aria-label={`Posición ${entry.position}`}
                className={`courier-ranking-position position-${entry.position}`}
              >
                {entry.position === 1 ? (
                  <Trophy aria-hidden="true" size={17} />
                ) : entry.position <= 3 ? (
                  <Medal aria-hidden="true" size={17} />
                ) : (
                  entry.position
                )}
              </span>
              <span className="courier-ranking-identity">
                <strong>{entry.name}</strong>
                <span>ID {entry.courierId}</span>
              </span>
              <strong className="courier-ranking-total">
                {entry.completedOrders}
                <span>
                  {entry.completedOrders === 1 ? " entrega" : " entregas"}
                </span>
              </strong>
            </li>
          ))}
        </ol>
      ) : ranking ? (
        <div className="empty-table-state courier-ranking-empty">
          <Truck aria-hidden="true" size={26} />
          <strong>Sin repartidores activos</strong>
          <span>El ranking aparecerá cuando exista una cuenta activa.</span>
        </div>
      ) : (
        <div className="empty-table-state courier-ranking-empty">
          <Truck aria-hidden="true" size={26} />
          <strong>Ranking no disponible</strong>
          <span>No se pudieron consultar las entregas del mes.</span>
        </div>
      )}

      {ranking?.entries.length ? (
        <p className="courier-ranking-summary">
          {completedOrdersLabel(ranking.completedOrders)} este mes ·{" "}
          {ranking.activeCourierCount}{" "}
          {ranking.activeCourierCount === 1
            ? "repartidor activo"
            : "repartidores activos"}
        </p>
      ) : null}
    </section>
  );
}
