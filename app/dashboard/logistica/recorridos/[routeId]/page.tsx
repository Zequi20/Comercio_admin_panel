import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RouteTracking } from "@/app/components/logistics/route-tracking";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function RecorridoPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  const { routeId } = await params;
  if (!/^\d+$/.test(routeId)) notFound();

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">
            <Link href="/dashboard/logistica">Logística</Link> · Recorrido
          </p>
          <h1 className="dashboard-title">Seguimiento del recorrido</h1>
          <p className="muted">Avance por parada, cobros, historial y rendición.</p>
        </div>
      </div>

      <RouteTracking routeId={Number(routeId)} />
    </main>
  );
}
