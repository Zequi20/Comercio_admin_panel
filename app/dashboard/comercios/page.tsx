import { redirect } from "next/navigation";

import { MerchantsManager } from "@/app/components/merchants-manager";
import { PageHeader } from "@/app/components/page-header";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function ComerciosPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <PageHeader
        description="Creá y administrá los comercios que agrupan catálogos, órdenes y usuarios."
        title="Gestión de comercios"
      />

      <MerchantsManager />
    </main>
  );
}
