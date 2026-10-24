"use client";

import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

type Step = "request" | "confirm" | "done";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    loggedIn?: boolean;
  };

  return { ok: response.ok, payload };
}

export function PasswordResetForm({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(targetEmail: string) {
    const { ok, payload } = await postJson("/api/auth/password-reset/request", {
      email: targetEmail,
    });

    if (!ok) {
      throw new Error(payload.message ?? "No se pudo enviar el código.");
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    setNotice(
      "Si el correo está registrado, te enviamos un código de 6 dígitos. Vence en 30 minutos."
    );
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextEmail = email.trim().toLowerCase();

    if (!isValidEmail(nextEmail)) {
      setError("Ingresá un correo válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      await sendCode(nextEmail);
      setEmail(nextEmail);
      setStep("confirm");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar el código."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setIsSubmitting(true);

    try {
      await sendCode(email);
      setCode("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar el código."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError("Ingresá el código de 6 dígitos que te enviamos.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { ok, payload } = await postJson("/api/auth/password-reset/confirm", {
        email,
        code,
        newPassword,
      });

      if (!ok) {
        throw new Error(payload.message ?? "No se pudo cambiar la contraseña.");
      }

      if (payload.loggedIn) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setNotice(
        payload.message
          ? `Tu contraseña se cambió, pero no pudimos abrir el portal: ${payload.message}`
          : "Tu contraseña se cambió. Ya podés iniciar sesión con la nueva contraseña."
      );
      setStep("done");
      setIsSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cambiar la contraseña."
      );
      setIsSubmitting(false);
    }
  }

  function handleChangeEmail() {
    setStep("request");
    setCode("");
    setNotice(null);
    setError(null);
  }

  const errorBox = error ? (
    <div className="error-box" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <span>{error}</span>
    </div>
  ) : null;

  const noticeBox = notice ? (
    <div className="success-box" role="status">
      <CircleCheck aria-hidden="true" size={18} />
      <span>{notice}</span>
    </div>
  ) : null;

  if (step === "done") {
    return (
      <div className="login-form">
        {noticeBox}
        <Link className="button-primary" href="/login">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  if (step === "request") {
    return (
      <form className="login-form" onSubmit={handleRequest}>
        <div className="field-group">
          <label className="field-label" htmlFor="reset-email">
            Correo
          </label>
          <div className="input-wrap">
            <Mail aria-hidden="true" size={18} />
            <input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="comercio@pedidos.com"
              value={email}
              disabled={isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        {errorBox}

        <button className="button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span aria-hidden="true" className="spinner" />
              Enviando código
            </>
          ) : (
            "Enviar código"
          )}
        </button>

        <Link className="text-link" href="/login">
          Volver a iniciar sesión
        </Link>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handleConfirm}>
      {noticeBox}

      <p className="field-help">
        Código enviado a <strong>{email}</strong>.{" "}
        <button
          type="button"
          className="text-link"
          onClick={handleChangeEmail}
          disabled={isSubmitting}
        >
          Cambiar correo
        </button>
      </p>

      <div className="field-group">
        <label className="field-label" htmlFor="reset-code">
          Código
        </label>
        <div className="input-wrap">
          <KeyRound aria-hidden="true" size={18} />
          <input
            id="reset-code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            disabled={isSubmitting}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="reset-new-password">
          Nueva contraseña
        </label>
        <div className="input-wrap">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            id="reset-new-password"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={newPassword}
            disabled={isSubmitting}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <button
            type="button"
            className="input-action"
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPassword((current) => !current)}
            disabled={isSubmitting}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="reset-confirm-password">
          Repetí la contraseña
        </label>
        <div className="input-wrap">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            id="reset-confirm-password"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            disabled={isSubmitting}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
      </div>

      {errorBox}

      <button className="button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <span aria-hidden="true" className="spinner" />
            Cambiando contraseña
          </>
        ) : (
          "Cambiar contraseña"
        )}
      </button>

      <button
        type="button"
        className="button-secondary"
        onClick={handleResend}
        disabled={isSubmitting || cooldown > 0}
      >
        {cooldown > 0 ? `Reenviar código en ${cooldown} s` : "Reenviar código"}
      </button>
    </form>
  );
}
