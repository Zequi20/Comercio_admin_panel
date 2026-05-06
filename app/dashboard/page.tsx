import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Package,
  PauseCircle,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Store,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCommerceSessionFromCookies } from "../lib/auth/session";

export const dynamic = "force-dynamic";

const stats = [
  {
    label: "Pedidos nuevos",
    value: "3",
    meta: "Requieren confirmación",
    icon: ReceiptText,
    pill: "Pendiente",
    pillClass: "pending",
  },
  {
    label: "En preparación",
    value: "7",
    meta: "Tiempo medio 18 min",
    icon: Clock3,
    pill: "Activo",
    pillClass: "hot",
  },
  {
    label: "Listos",
    value: "2",
    meta: "Esperando retiro",
    icon: Package,
    pill: "Para entregar",
    pillClass: "done",
  },
  {
    label: "Entregados",
    value: "18",
    meta: "Hoy",
    icon: CheckCircle2,
    pill: "Cerrado",
    pillClass: "success",
  },
];

const orders = [
  {
    code: "#YP-1048",
    customer: "Laura Benítez",
    time: "Hace 4 min",
    status: "Pendiente",
    pillClass: "pending",
    total: "Gs. 82.000",
  },
  {
    code: "#YP-1047",
    customer: "Diego Vera",
    time: "Hace 12 min",
    status: "Confirmado",
    pillClass: "hot",
    total: "Gs. 46.500",
  },
  {
    code: "#YP-1046",
    customer: "Ana Gómez",
    time: "Hace 21 min",
    status: "Listo",
    pillClass: "done",
    total: "Gs. 128.000",
  },
];

const quickActions = [
  {
    title: "Pausar ventas",
    detail: "Cerrar temporalmente el comercio",
    icon: PauseCircle,
  },
  {
    title: "Agregar producto",
    detail: "Crear producto o servicio",
    icon: Plus,
  },
  {
    title: "Ver pedidos",
    detail: "Abrir cola operativa",
    icon: ReceiptText,
  },
];

function merchantStatus(isOpen?: boolean | null) {
  if (isOpen === true) {
    return { label: "Abierto", className: "success" };
  }

  if (isOpen === false) {
    return { label: "Cerrado", className: "error" };
  }

  return { label: "Estado pendiente", className: "pending" };
}

export default async function DashboardPage() {
  const session = await getCommerceSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  const status = merchantStatus(session.merchant.isOpen);

  return (
        <main className="dashboard-main">
          <div className="dashboard-topbar">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1 className="dashboard-title">Operación del comercio</h1>
              <p className="muted">
                {session.merchant.name} · {session.user.email}
              </p>
            </div>
            <div className="dashboard-actions">
              <button className="icon-button" type="button" title="Buscar">
                <Search size={18} />
              </button>
              <button className="icon-button" type="button" title="Notificaciones">
                <Bell size={18} />
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="main-column" aria-label="Resumen operativo">
              <div className="stats-grid">
                {stats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article className="card stat-card" key={item.label}>
                      <div className="card-header">
                        <span className="icon-surface" aria-hidden="true">
                          <Icon size={19} />
                        </span>
                        <span className={`pill ${item.pillClass}`}>
                          {item.pill}
                        </span>
                      </div>
                      <span className="stat-label">{item.label}</span>
                      <strong className="stat-value">{item.value}</strong>
                      <span className="stat-label">{item.meta}</span>
                    </article>
                  );
                })}
              </div>

              <section className="card card-lg">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Pedidos recientes</h2>
                    <p className="muted">
                      Placeholder para la cola de pedidos del comercio.
                    </p>
                  </div>
                  <button className="button-tonal" type="button">
                    <ReceiptText size={17} />
                    Ver pedidos
                  </button>
                </div>

                <div className="orders-list">
                  {orders.map((order) => (
                    <article className="order-row" key={order.code}>
                      <div>
                        <div className="order-code">{order.code}</div>
                        <div className="order-meta">{order.time}</div>
                      </div>
                      <div className="order-customer">
                        <strong>{order.customer}</strong>
                        <div className="order-meta">Delivery · pago online</div>
                      </div>
                      <span className={`pill ${order.pillClass}`}>
                        {order.status}
                      </span>
                      <strong>{order.total}</strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card card-lg">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Acciones rápidas</h2>
                    <p className="muted">
                      Primeras acciones del portal comercio.
                    </p>
                  </div>
                </div>
                <div className="quick-actions">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        className="quick-action"
                        type="button"
                        key={action.title}
                      >
                        <span className="icon-surface" aria-hidden="true">
                          <Icon size={19} />
                        </span>
                        <span>
                          <strong>{action.title}</strong>
                          <br />
                          <span>{action.detail}</span>
                        </span>
                        <ArrowRight aria-hidden="true" size={18} />
                      </button>
                    );
                  })}
                </div>
              </section>
            </section>

            <aside className="side-column" aria-label="Estado del comercio">
              <section className="card card-lg">
                <div className="merchant-summary">
                  <div className="commerce-avatar" aria-hidden="true">
                    <Store size={28} />
                  </div>
                  <div>
                    <h2>{session.merchant.name}</h2>
                    <span className={`pill ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
                <div className="metric-list" style={{ marginTop: 18 }}>
                  <div className="metric-row">
                    <span className="metric-label">Comercio ID</span>
                    <span className="metric-value">{session.merchant.id}</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Costo delivery</span>
                    <span className="metric-value">
                      {session.merchant.deliveryCost ?? "Pendiente"}
                    </span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Contacto</span>
                    <span className="metric-value">
                      {session.merchant.contactEmail ?? "Sin correo"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2 className="card-title">Métricas</h2>
                  <span className="pill">Hoy</span>
                </div>
                <div className="metric-list">
                  <div className="metric-row">
                    <span className="metric-label">Ventas</span>
                    <span className="metric-value">Gs. 1.240.000</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Ticket medio</span>
                    <span className="metric-value">Gs. 68.800</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Tiempo prep.</span>
                    <span className="metric-value">18 min</span>
                  </div>
                </div>
              </section>

              <section className="empty-state">
                <ShoppingBag aria-hidden="true" size={28} />
                <div>
                  <h2 className="card-title">Catálogo placeholder</h2>
                  <p className="muted">
                    Productos y servicios se conectan en la siguiente iteración.
                  </p>
                </div>
                <button className="button-secondary" type="button">
                  <Plus size={17} />
                  Agregar producto
                </button>
              </section>
            </aside>
          </div>
        </main>
  );
}
