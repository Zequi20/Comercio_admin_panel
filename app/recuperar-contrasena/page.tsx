import { KeyRound } from "lucide-react";
import { redirect } from "next/navigation";

import { PasswordResetForm } from "../components/password-reset-form";
import { ThemeToggle } from "../components/theme-toggle";
import { getCommerceSessionFromCookies } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const session = await getCommerceSessionFromCookies();

  if (session) {
    redirect("/dashboard");
  }

  const { email } = await searchParams;
  const initialEmail = typeof email === "string" ? email : "";

  return (
    <main className="page-shell login-page">
      <section
        className="login-panel password-reset-panel"
        aria-label="Recuperar contraseña"
      >
        <div className="login-panel-header">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <KeyRound size={26} />
            </div>
            <div>
              <p className="eyebrow">Comercio</p>
              <h2 className="section-title">Recuperar contraseña</h2>
            </div>
          </div>
          <ThemeToggle compact />
        </div>
        <p className="login-copy">
          Te enviamos un código a tu correo para que elijas una contraseña nueva.
          Al cambiarla se cierran las sesiones abiertas en otros dispositivos.
        </p>
        <PasswordResetForm initialEmail={initialEmail} />
      </section>
    </main>
  );
}
