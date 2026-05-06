import { Package, Plus, Search } from "lucide-react";

export default function CatalogoPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1 className="dashboard-title">Productos y servicios</h1>
          <p className="muted">Administrá la oferta visible para clientes.</p>
        </div>
        <div className="dashboard-actions">
          <button className="icon-button" type="button" title="Buscar">
            <Search size={18} />
          </button>
          <button className="button-tonal" type="button">
            <Plus size={17} />
            Agregar
          </button>
        </div>
      </div>

      <section className="card card-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Catálogo</h2>
            <p className="muted">Productos activos, servicios y disponibilidad.</p>
          </div>
          <span className="pill pending">Pendiente</span>
        </div>

        <div className="empty-state">
          <Package aria-hidden="true" size={28} />
          <div>
            <h2 className="card-title">Sin productos cargados</h2>
            <p className="muted">Creá el primer producto o servicio del comercio.</p>
          </div>
          <button className="button-secondary" type="button">
            <Plus size={17} />
            Agregar producto
          </button>
        </div>
      </section>
    </main>
  );
}
