import { NotificationsManager } from "../../components/notifications-manager";

export default function NotificacionesPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Notificaciones</p>
          <h1 className="dashboard-title">Centro de difusión</h1>
          <p className="muted">
            Enviá mensajes a Clientes y Repartidores.
          </p>
        </div>
      </div>

      <NotificationsManager />
    </main>
  );
}
