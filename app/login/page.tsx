import {
  ClipboardCheck,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Store,
} from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "../components/login-form";
import { ThemeToggle } from "../components/theme-toggle";
import { getCommerceSessionFromCookies } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getCommerceSessionFromCookies();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="page-shell login-page">
      <div className="login-grid">
        <section className="login-context" aria-label="Acceso comercio">
          <div>
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">
                <Store size={28} />
              </div>
              <div>
                <p className="eyebrow">Pedidos Comercio</p>
                <h1 className="login-title">Portal comercio</h1>
              </div>
            </div>
            <p className="login-copy">
              Acceso operativo para gestionar pedidos, catálogo y estado del
              comercio desde una misma vista.
            </p>
          </div>

          <div className="access-list" aria-label="Requisitos de acceso">
            <div className="access-row">
              <span className="access-icon" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>Rol habilitado</strong>
                <span>MERCHANT o ADMIN con permisos de gestión.</span>
              </div>
            </div>
            <div className="access-row">
              <span className="access-icon" aria-hidden="true">
                <Store size={20} />
              </span>
              <div>
                <strong>Comercio asociado</strong>
                <span>El usuario debe estar vinculado a un comercio.</span>
              </div>
            </div>
            <div className="access-row">
              <span className="access-icon" aria-hidden="true">
                <ClipboardCheck size={20} />
              </span>
              <div>
                <strong>Permisos operativos</strong>
                <span>Pedidos, productos o notificaciones de comercio.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-label="Inicio de sesión">
          <div className="login-panel-header">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">
                <Store size={26} />
              </div>
              <div>
                <p className="eyebrow">Comercio</p>
                <h2 className="section-title">Iniciar sesión</h2>
              </div>
            </div>
            <ThemeToggle compact />
          </div>
          <p className="login-copy">
            Entrá con tu cuenta Pedidos. Vamos a validar rol, permisos y comercio
            asociado antes de abrir el dashboard.
          </p>
          <LoginForm />

          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className="pill">
              <ReceiptText size={14} />
              Pedidos
            </span>
            <span className="pill">
              <PackageCheck size={14} />
              Catálogo
            </span>
            <span className="pill hot">
              <ShieldCheck size={14} />
              Acceso seguro
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
