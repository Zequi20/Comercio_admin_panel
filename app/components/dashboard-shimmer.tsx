function StatCardShimmer() {
  return (
    <article className="card stat-card dashboard-shimmer-card">
      <div className="card-header">
        <span className="skeleton shimmer-icon" />
        <span className="skeleton shimmer-pill" />
      </div>
      <span className="skeleton shimmer-line short" />
      <span className="skeleton shimmer-value" />
      <span className="skeleton shimmer-line medium" />
    </article>
  );
}

function OrderRowShimmer() {
  return (
    <article className="order-row priority-order-row dashboard-shimmer-row">
      <div>
        <span className="skeleton shimmer-line tiny" />
        <span className="skeleton shimmer-line short" />
      </div>
      <div>
        <span className="skeleton shimmer-line medium" />
        <span className="skeleton shimmer-line short" />
      </div>
      <span className="skeleton shimmer-pill" />
      <div>
        <span className="skeleton shimmer-line short" />
        <span className="skeleton shimmer-line tiny" />
      </div>
    </article>
  );
}

function QuickActionShimmer() {
  return (
    <div className="quick-action dashboard-shimmer-action">
      <span className="skeleton shimmer-icon" />
      <span>
        <span className="skeleton shimmer-line medium" />
        <span className="skeleton shimmer-line short" />
      </span>
      <span className="skeleton shimmer-pill" />
    </div>
  );
}

function MetricRowShimmer() {
  return (
    <div className="metric-row">
      <span className="skeleton shimmer-line short" />
      <span className="skeleton shimmer-line tiny" />
    </div>
  );
}

export function DashboardContentShimmer() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando información del dashboard"
      className="dashboard-grid dashboard-shimmer"
      role="status"
    >
      <section className="main-column" aria-label="Resumen operativo">
        <div className="stats-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCardShimmer key={index} />
          ))}
        </div>

        <section className="card card-lg">
          <div className="card-header">
            <div>
              <span className="skeleton shimmer-title" />
              <span className="skeleton shimmer-line long" />
            </div>
            <span className="skeleton shimmer-button" />
          </div>
          <div className="orders-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <OrderRowShimmer key={index} />
            ))}
          </div>
        </section>

        <section className="card card-lg">
          <div className="card-header">
            <div>
              <span className="skeleton shimmer-title" />
              <span className="skeleton shimmer-line medium" />
            </div>
          </div>
          <div className="quick-actions">
            {Array.from({ length: 3 }).map((_, index) => (
              <QuickActionShimmer key={index} />
            ))}
          </div>
        </section>
      </section>

      <aside className="side-column" aria-label="Estado del comercio">
        <section className="card card-lg">
          <div className="merchant-summary">
            <span className="skeleton shimmer-avatar" />
            <div>
              <span className="skeleton shimmer-title" />
              <span className="skeleton shimmer-line short" />
            </div>
          </div>
          <span className="skeleton shimmer-panel" />
          <span className="skeleton shimmer-panel compact" />
          <div className="metric-list dashboard-side-metrics">
            {Array.from({ length: 3 }).map((_, index) => (
              <MetricRowShimmer key={index} />
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="skeleton shimmer-title" />
            <span className="skeleton shimmer-pill" />
          </div>
          <div className="metric-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <MetricRowShimmer key={index} />
            ))}
          </div>
        </section>

        <section className="empty-state dashboard-catalog-summary">
          <span className="skeleton shimmer-icon" />
          <div>
            <span className="skeleton shimmer-title" />
            <span className="skeleton shimmer-line long" />
            <span className="skeleton shimmer-line medium" />
          </div>
          <span className="skeleton shimmer-button" />
        </section>
      </aside>
    </div>
  );
}

export function DashboardPageShimmer() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar dashboard-shimmer-topbar">
        <div>
          <span className="skeleton shimmer-line tiny" />
          <span className="skeleton shimmer-heading" />
          <span className="skeleton shimmer-line long" />
        </div>
        <div className="dashboard-actions">
          <span className="skeleton shimmer-button" />
          <span className="skeleton shimmer-button" />
        </div>
      </div>

      <DashboardContentShimmer />
    </main>
  );
}
