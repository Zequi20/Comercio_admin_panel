import { redirect } from "next/navigation";

import { UsersManager } from "@/app/components/users-manager";
import { getCommerceSessionFromCookies } from "@/app/lib/auth/session";

export default async function UsuariosPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) redirect("/login");
  if (!session.user.roles.includes("ADMIN")) redirect("/dashboard");

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar users-topbar">
        <div>
          <p className="eyebrow">Administración global</p>
          <h1 className="dashboard-title">Usuarios y roles</h1>
          <p className="muted">
            Gestioná cuentas, afiliaciones, estados y accesos RBAC del sistema.
          </p>
        </div>
        <span className="pill assigned">Sólo ADMIN</span>
      </div>

      <UsersManager
        currentUserId={
          session.user.id === undefined ? null : String(session.user.id)
        }
      />
    </main>
  );
}
