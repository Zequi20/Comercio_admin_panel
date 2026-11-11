import { redirect } from "next/navigation";

import { LogisticsOverview } from "@/app/components/logistics/logistics-overview";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function LogisticaPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Distribución</p>
          <h1 className="dashboard-title">Logística</h1>
          <p className="muted">
            Planillas de empresas de logística, recorridos de los repartidores y rendición de lo cobrado.
          </p>
        </div>
        <span className="pill assigned">Sólo ADMIN</span>
      </div>

      <LogisticsOverview />
    </main>
  );
}
