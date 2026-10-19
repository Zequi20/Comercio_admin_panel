import { redirect } from "next/navigation";

import { AccountDeletionRequestsManager } from "@/app/components/account-deletion-requests-manager";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function BajasPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar users-topbar">
        <div>
          <p className="eyebrow">Administración global</p>
          <h1 className="dashboard-title">Solicitudes de baja</h1>
          <p className="muted">
            Revisá y resolvé los pedidos de eliminación de cuenta que llegan desde el formulario público.
          </p>
        </div>
        <span className="pill assigned">Sólo ADMIN</span>
      </div>

      <AccountDeletionRequestsManager />
    </main>
  );
}
