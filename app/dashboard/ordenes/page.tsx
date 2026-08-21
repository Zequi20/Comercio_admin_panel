import { OrdersManager } from "../../components/orders-manager";
import { PageHeader } from "../../components/page-header";

export default function OrdenesPage() {
  return (
    <main className="dashboard-main">
      <PageHeader
        description="Administrá los pedidos del comercio."
        title="Cola operativa"
      />

      <OrdersManager />
    </main>
  );
}
