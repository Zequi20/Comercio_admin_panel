"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  CloudUpload,
  FileClock,
  Info,
  Lock,
  type LucideIcon,
  Package,
  PackageX,
  Route,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { formatGs } from "@/app/lib/logistics/client";

/**
 * Shared visual language of the logistics module. Every status has text, color and icon; the same
 * taxonomy is used in the courier app.
 */

export type Tone = "neutral" | "info" | "progress" | "success" | "danger" | "warning" | "closed" | "sync";

type StatusSpec = { label: string; tone: Tone; icon: LucideIcon };

export const SHIPMENT_STATUS: Record<string, StatusSpec> = {
  PENDING_RECEIPT: { label: "Por recibir", tone: "neutral", icon: Package },
  RECEIVED: { label: "Por entregar", tone: "info", icon: Truck },
  MISSING: { label: "Faltante", tone: "danger", icon: PackageX },
  DELIVERED: { label: "Entregado", tone: "success", icon: CheckCircle2 },
  FAILED: { label: "No entregado", tone: "danger", icon: AlertCircle },
  RETURN_PENDING: { label: "A devolver", tone: "warning", icon: Undo2 },
};

export const ROUTE_STATUS: Record<string, StatusSpec> = {
  ASSIGNED: { label: "Por recibir", tone: "neutral", icon: Package },
  IN_PROGRESS: { label: "En curso", tone: "progress", icon: Route },
  CLOSED: { label: "Cerrado", tone: "closed", icon: Lock },
};

export const IMPORT_STATUS: Record<string, StatusSpec> = {
  DRAFT: { label: "Por revisar", tone: "warning", icon: FileClock },
  CONFIRMED: { label: "Confirmada", tone: "success", icon: CheckCircle2 },
  DISCARDED: { label: "Descartada", tone: "neutral", icon: XCircle },
};

const FALLBACK: StatusSpec = { label: "—", tone: "neutral", icon: Circle };

export function StatusPill({
  status,
  kind,
  suffix,
}: {
  status: string;
  kind: "shipment" | "route" | "import";
  suffix?: string;
}) {
  const table = kind === "shipment" ? SHIPMENT_STATUS : kind === "route" ? ROUTE_STATUS : IMPORT_STATUS;
  const spec = table[status] ?? { ...FALLBACK, label: status };
  const Icon = spec.icon;
  return (
    <span className={`lg-status lg-tone-${spec.tone}`}>
      <Icon size={14} aria-hidden="true" />
      {spec.label}
      {suffix ? <span className="lg-status-suffix"> · {suffix}</span> : null}
    </span>
  );
}

export function ProgressSummary({
  done,
  total,
  label = "guías",
}: {
  done: number;
  total: number;
  label?: string;
}) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="lg-progress">
      <div className="lg-progress-text">
        <strong>
          {done} de {total} {label}
        </strong>
        <span>{percent}%</span>
      </div>
      <div
        className="lg-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} de ${total} ${label} con resultado`}
      >
        <span className="lg-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: Info,
  info: Info,
  progress: Route,
  success: CheckCircle2,
  danger: AlertCircle,
  warning: AlertTriangle,
  closed: Lock,
  sync: CloudUpload,
};

export type ActionItem = {
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
};

/** "Acción requerida": what needs attention now, with a direct way to do it. */
export function ActionRequiredCard({ item }: { item: ActionItem }) {
  const Icon = TONE_ICON[item.tone];
  return (
    <section className={`lg-action lg-tone-${item.tone}`} aria-label="Acción requerida">
      <Icon size={22} aria-hidden="true" className="lg-action-icon" />
      <div className="lg-action-body">
        <strong>{item.title}</strong>
        {item.detail ? <p>{item.detail}</p> : null}
      </div>
      {item.actionLabel && item.href ? (
        <Link className="button-primary" href={item.href}>
          {item.actionLabel}
        </Link>
      ) : item.actionLabel && item.onAction ? (
        <button className="button-primary" type="button" onClick={item.onAction}>
          {item.actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export type StepState = "done" | "current" | "pending" | "blocked";

export type Step = { label: string; state: StepState; hint?: string };

const STEP_ICON: Record<StepState, LucideIcon> = {
  done: CheckCircle2,
  current: CircleDot,
  pending: Circle,
  blocked: Lock,
};

const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "completado",
  current: "paso actual",
  pending: "pendiente",
  blocked: "bloqueado",
};

/** Horizontal on desktop, vertical on narrow screens (CSS). */
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="lg-stepper" aria-label={label}>
      {steps.map((step, index) => {
        const Icon = STEP_ICON[step.state];
        return (
          <li
            key={step.label}
            className={`lg-step lg-step-${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <div>
              <span className="lg-step-title">
                {index + 1}. {step.label}
                <span className="sr-only"> ({STEP_STATE_LABEL[step.state]})</span>
              </span>
              {step.hint ? <span className="lg-step-hint">{step.hint}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function MetricCard({
  label,
  value,
  tone = "neutral",
  icon: Icon,
  hint,
  active,
  onSelect,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  hint?: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span className="lg-metric-label">
        {Icon ? <Icon size={15} aria-hidden="true" /> : null}
        {label}
      </span>
      <strong className="lg-metric-value">{value}</strong>
      {hint ? <span className="lg-metric-hint">{hint}</span> : null}
    </>
  );
  return onSelect ? (
    <button
      type="button"
      className={`lg-metric lg-tone-${tone}${active ? " lg-metric-active" : ""}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      {content}
    </button>
  ) : (
    <div className={`lg-metric lg-tone-${tone}`}>{content}</div>
  );
}

/** Below this, a difference is minor (rounding, coins); above it, it needs attention. */
const MINOR_DIFFERENCE = 1_000;

export function differenceTone(difference: number): Tone {
  if (difference === 0) return "success";
  return Math.abs(difference) <= MINOR_DIFFERENCE ? "warning" : "danger";
}

/** Collected against expected, with color, icon and an explanation, never color alone. */
export function MoneyDifferenceCard({
  expected,
  collected,
  onSelect,
  active,
}: {
  expected: number;
  collected: number;
  onSelect?: () => void;
  active?: boolean;
}) {
  const difference = collected - expected;
  const tone = differenceTone(difference);
  const hint =
    difference === 0
      ? "Conciliado: lo cobrado coincide con lo entregado."
      : difference < 0
        ? `Faltan ${formatGs(-difference)} respecto de las guías entregadas.`
        : `Se cobraron ${formatGs(difference)} de más.`;
  return (
    <MetricCard
      label="Diferencia"
      value={`${difference > 0 ? "+" : ""}${formatGs(difference)}`}
      tone={tone}
      icon={TONE_ICON[tone]}
      hint={hint}
      active={active}
      onSelect={onSelect}
    />
  );
}

export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const relativeTime = (from: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return "hace instantes";
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
};

/** Text that explains why an action is not available, placed right under it. */
export function BlockedReason({ children }: { children: ReactNode }) {
  return (
    <p className="lg-blocked" role="note">
      <Lock size={14} aria-hidden="true" /> {children}
    </p>
  );
}

/**
 * Confirmation that lists what the action will do before doing it. Focus moves into the dialog and
 * Escape closes it.
 */
export function ConfirmImpactDialog({
  open,
  title,
  impacts,
  confirmLabel,
  tone = "warning",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  impacts: string[];
  confirmLabel: string;
  tone?: Tone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const Icon = TONE_ICON[tone];
  return (
    <div className="lg-dialog-layer">
      <div className="lg-dialog-backdrop" onClick={onCancel} />
      <div className={`lg-dialog card lg-tone-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="card-title">
          <Icon size={20} aria-hidden="true" /> {title}
        </h2>
        <ul className="lg-dialog-impacts">
          {impacts.map((impact) => (
            <li key={impact}>{impact}</li>
          ))}
        </ul>
        <div className="form-actions">
          <button ref={cancelRef} className="button-secondary" type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="button-primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
