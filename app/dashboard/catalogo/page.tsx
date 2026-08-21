import { CatalogManager } from "../../components/catalog-manager";
import { PageHeader } from "../../components/page-header";

export default function CatalogoPage() {
  return (
    <main className="dashboard-main">
      <PageHeader
        description="Administrá la oferta visible para clientes."
        title="Productos y servicios"
      />

      <CatalogManager />
    </main>
  );
}
