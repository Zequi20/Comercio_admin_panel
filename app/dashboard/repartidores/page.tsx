import { CouriersManager } from "../../components/couriers-manager";

export default function RepartidoresPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Repartidores</p>
          <h1 className="dashboard-title">Red de entrega</h1>
          <p className="muted">
            Consultá el pool universal y administrá los favoritos de tu comercio.
          </p>
        </div>
      </div>

      <CouriersManager />
    </main>
  );
}
