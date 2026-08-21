import { CouriersManager } from "../../components/couriers-manager";
import { PageHeader } from "../../components/page-header";

export default function RepartidoresPage() {
  return (
    <main className="dashboard-main">
      <PageHeader
        description="Disponibilidad y cobertura para delivery."
        title="Equipo de entrega"
      />

      <CouriersManager />
    </main>
  );
}
