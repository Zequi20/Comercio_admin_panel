import { redirect } from "next/navigation";

import { UsersManager } from "@/app/components/users-manager";
import { PageHeader } from "@/app/components/page-header";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function UsuariosPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <PageHeader
        description="Gestioná cuentas, afiliaciones, estados y permisos efectivos del sistema."
        title="Usuarios y roles"
      />

      <UsersManager
        currentUserId={
          session.user.id === undefined ? null : String(session.user.id)
        }
      />
    </main>
  );
}
