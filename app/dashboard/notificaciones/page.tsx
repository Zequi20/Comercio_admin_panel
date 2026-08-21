import { NotificationsManager } from "../../components/notifications-manager";
import { PageHeader } from "../../components/page-header";

export default function NotificacionesPage() {
  return (
    <main className="dashboard-main">
      <PageHeader
        description="Enviá mensajes a clientes y repartidores."
        title="Centro de difusión"
      />

      <NotificationsManager />
    </main>
  );
}
