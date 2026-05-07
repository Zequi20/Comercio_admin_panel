import { OrdersManager } from "../../components/orders-manager";

export default function OrdenesPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Órdenes</p>
          <h1 className="dashboard-title">Cola operativa</h1>
          <p className="muted">Administrá los pedidos del comercio.</p>
        </div>
      </div>

      <OrdersManager />
    </main>
  );
}
