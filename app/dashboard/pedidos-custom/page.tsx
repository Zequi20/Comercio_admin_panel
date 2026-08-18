import { redirect } from "next/navigation";

import { CustomOrdersManager } from "@/app/components/custom-orders-manager";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function PedidosCustomPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Administración global</p>
          <h1 className="dashboard-title">Pedidos custom</h1>
          <p className="muted">
            Gestioná encargos libres sin mezclarlos con órdenes de catálogo.
          </p>
        </div>
        <span className="pill assigned">Sólo ADMIN</span>
      </div>

      <CustomOrdersManager />
    </main>
  );
}
