import { CouriersManager } from "../../components/couriers-manager";

export default function RepartidoresPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Repartidores</p>
          <h1 className="dashboard-title">Equipo de entrega</h1>
          <p className="muted">Disponibilidad y cobertura para delivery.</p>
        </div>
      </div>

      <CouriersManager />
    </main>
  );
}
