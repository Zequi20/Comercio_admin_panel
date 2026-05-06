import { CatalogManager } from "../../components/catalog-manager";

export default function CatalogoPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1 className="dashboard-title">Productos y servicios</h1>
          <p className="muted">Administrá la oferta visible para clientes.</p>
        </div>
      </div>

      <CatalogManager />
    </main>
  );
}
