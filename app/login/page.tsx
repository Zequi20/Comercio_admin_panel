import { redirect } from "next/navigation";

import { LoginForm } from "../components/login-form";
import { RuteqoLogo } from "../components/ruteqo-logo";
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
      <div className="login-shell">
        <section className="login-brand-rail" aria-label="Ruteqo Comercio">
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden="true">
              <RuteqoLogo size={48} />
            </span>
            <span>Ruteqo Comercio</span>
          </div>

          <div className="login-brand-copy">
            <h2>Portal comercio</h2>
            <p>
              Gestioná pedidos, catálogo y el estado de tu comercio desde un
              solo lugar.
            </p>
          </div>
        </section>

        <section className="login-auth-surface" aria-labelledby="login-title">
          <div className="login-theme-control">
            <ThemeToggle compact />
          </div>

          <div className="login-auth-content">
            <header className="login-auth-heading">
              <h1 id="login-title">Iniciar sesión</h1>
              <p>Ingresá con tu cuenta para continuar.</p>
            </header>

            <LoginForm />

            <p className="login-access-note">Acceso para usuarios habilitados</p>
          </div>
        </section>
      </div>
    </main>
  );
}
