import { redirect } from "next/navigation";

import { MerchantsManager } from "@/app/components/merchants-manager";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function ComerciosPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar merchants-topbar">
        <div>
          <p className="eyebrow">Administración global</p>
          <h1 className="dashboard-title">Gestión de comercios</h1>
          <p className="muted">
            Creá y administrá los comercios que agrupan catálogos, órdenes y usuarios.
          </p>
        </div>
        <span className="pill assigned">Sólo ADMIN</span>
      </div>

      <MerchantsManager />
    </main>
  );
}
