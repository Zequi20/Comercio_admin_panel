import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ImportReview } from "@/app/components/logistics/import-review";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function ImportacionPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  const { importId } = await params;
  if (!/^\d+$/.test(importId)) notFound();

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">
            <Link href="/dashboard/logistica">Logística</Link> · Importación
          </p>
          <h1 className="dashboard-title">Revisar planilla</h1>
          <p className="muted">
            Revisá errores, advertencias y totales antes de crear el recorrido.
          </p>
        </div>
      </div>

      <ImportReview importId={Number(importId)} />
    </main>
  );
}
