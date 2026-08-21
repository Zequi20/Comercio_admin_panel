import { redirect } from "next/navigation";

import { CustomOrdersManager } from "@/app/components/custom-orders-manager";
import { PageHeader } from "@/app/components/page-header";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function PedidosCustomPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <PageHeader
        description="Gestioná encargos libres sin mezclarlos con órdenes de catálogo."
        title="Pedidos libres"
      />

      <CustomOrdersManager />
    </main>
  );
}
