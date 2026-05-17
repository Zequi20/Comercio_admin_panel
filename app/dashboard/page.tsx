import {
  CheckCircle2,
  Clock3,
  Package,
  Plus,
  ReceiptText,
  Store,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCommerceRequestContextFromCookies } from "../lib/auth/session";
import { orderStatusLabel } from "../lib/order-status";
import {
  listCouriersForMerchant,
  listOrdersForMerchant,
  listProductsForMerchant,
  type Order,
} from "../lib/services/commerce-services";

export const dynamic = "force-dynamic";

const statusPillClass: Record<string, string> = {
  PLACED: "pending",
  CONFIRMED: "confirmed",
  ASSIGNED: "assigned",
  PICKED_UP: "picked-up",
  DELIVERED: "success",
  CANCELED: "error",
};

const quickActions = [
  {
    title: "Nueva orden",
    detail: "Cargar un pedido manual",
    href: "/dashboard/ordenes",
    icon: Plus,
  },
  {
    title: "Agregar producto",
    detail: "Actualizar la oferta visible",
    href: "/dashboard/catalogo",
    icon: Package,
  },
  {
    title: "Repartidores",
    detail: "Revisar equipo de entrega",
    href: "/dashboard/repartidores",
    icon: Truck,
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

function formatPrice(value: number | string | undefined, currency = "PYG") {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return `${currency} ${value}`;
  }

  if (currency === "PYG") {
    return `Gs. ${amount.toLocaleString("es-PY", {
      maximumFractionDigits: 0,
    })}`;
  }

  try {
    return new Intl.NumberFormat("es-PY", {
      currency,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-PY")}`;
  }
}

function formatDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function customerName(order: Order) {
  const customer = order.customer;

  return (
    customer?.name ??
    customer?.nickname ??
    customer?.email ??
    `Cliente #${customer?.id ?? "-"}`
  );
}

function sameDay(value?: string) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  return date.toDateString() === today.toDateString();
}

async function loadDashboardData(accessToken: string, merchantId: number | string) {
  const [orders, products, couriers] = await Promise.all([
    listOrdersForMerchant({ accessToken, limit: 100 }).catch(() => null),
    listProductsForMerchant({
      accessToken,
      merchantId,
      limit: 100,
    }).catch(() => null),
    listCouriersForMerchant({ accessToken, limit: 100 }).catch(() => null),
  ]);

  return {
    orders: orders?.data ?? [],
    products: products?.data ?? [],
    couriers: couriers?.data ?? [],
  };
}

export default async function DashboardPage() {
  const context = await getCommerceRequestContextFromCookies();

  if (!context) {
    redirect("/login");
  }

  const { session, accessToken } = context;
  const status = merchantStatus(session.merchant.isOpen);
  const { orders, products, couriers } = await loadDashboardData(
    accessToken,
    session.merchant.id
  );

  const openOrders = orders.filter(
    (order) => order.status !== "DELIVERED" && order.status !== "CANCELED"
  );
  const pendingOrders = orders.filter((order) => order.status === "PLACED");
  const assignableOrders = orders.filter(
    (order) =>
      order.fulfillmentType !== "PICKUP" &&
      order.status === "CONFIRMED" &&
      !order.courier?.id
  );
  const deliveredToday = orders.filter(
    (order) => order.status === "DELIVERED" && sameDay(order.updatedAt)
  );
  const deliveredTodayTotal = deliveredToday.reduce((total, order) => {
    const amount = Number(order.total ?? 0);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
  const averageTicket =
    deliveredToday.length > 0 ? deliveredTodayTotal / deliveredToday.length : 0;
  const recentOrders = orders.slice(0, 4);
  const activeProducts = products.filter((product) => product.available).length;
  const activeCouriers = couriers.filter((courier) => courier.isActive).length;

  const stats = [
    {
      label: "Pendientes",
      value: String(pendingOrders.length),
      meta: "Requieren confirmación",
      icon: ReceiptText,
      pill: "Atención",
      pillClass: "pending",
    },
    {
      label: "Para asignar",
      value: String(assignableOrders.length),
      meta: "Delivery confirmado",
      icon: Truck,
      pill: "Delivery",
      pillClass: "assigned",
    },
    {
      label: "Abiertas",
      value: String(openOrders.length),
      meta: "En flujo operativo",
      icon: Clock3,
      pill: "Activas",
      pillClass: "confirmed",
    },
    {
      label: "Entregadas hoy",
      value: String(deliveredToday.length),
      meta: formatPrice(deliveredTodayTotal),
      icon: CheckCircle2,
      pill: "Cerrado",
      pillClass: "success",
    },
  ];

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
          <Link className="button-secondary" href="/dashboard/catalogo">
            <Package size={17} />
            Catálogo
          </Link>
          <Link className="button-tonal" href="/dashboard/ordenes">
            <ReceiptText size={17} />
            Ver órdenes
          </Link>
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
                <p className="muted">Últimos pedidos recibidos del comercio.</p>
              </div>
              <Link className="button-tonal" href="/dashboard/ordenes">
                <ReceiptText size={17} />
                Ver pedidos
              </Link>
            </div>

            {recentOrders.length ? (
              <div className="orders-list">
                {recentOrders.map((order) => (
                  <article className="order-row" key={order.id}>
                    <div>
                      <div className="order-code">#{order.id}</div>
                      <div className="order-meta">{formatDate(order.createdAt)}</div>
                    </div>
                    <div className="order-customer">
                      <strong>{customerName(order)}</strong>
                      <div className="order-meta">
                        {order.fulfillmentType === "PICKUP"
                          ? "Retiro"
                          : "Delivery"}
                      </div>
                    </div>
                    <span
                      className={`pill ${
                        statusPillClass[order.status ?? "PLACED"] ?? "pending"
                      }`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                    <strong>{formatPrice(order.total, order.currency)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-table-state">
                <ReceiptText aria-hidden="true" size={26} />
                <strong>Sin pedidos recientes</strong>
                <span>Cuando entren órdenes nuevas, van a aparecer acá.</span>
              </div>
            )}
          </section>

          <section className="card card-lg">
            <div className="card-header">
              <div>
                <h2 className="card-title">Acciones rápidas</h2>
                <p className="muted">Atajos para las tareas más frecuentes.</p>
              </div>
            </div>
            <div className="quick-actions">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link className="quick-action" href={action.href} key={action.title}>
                    <span className="icon-surface" aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <span>
                      <strong>{action.title}</strong>
                      <br />
                      <span>{action.detail}</span>
                    </span>
                    <span aria-hidden="true" className="quick-action-arrow">
                      Abrir
                    </span>
                  </Link>
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
            <div className="metric-list dashboard-side-metrics">
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
                <span className="metric-label">Ventas entregadas</span>
                <span className="metric-value">
                  {formatPrice(deliveredTodayTotal)}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Ticket medio</span>
                <span className="metric-value">{formatPrice(averageTicket)}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Pedidos abiertos</span>
                <span className="metric-value">{openOrders.length}</span>
              </div>
            </div>
          </section>

          <section className="empty-state dashboard-catalog-summary">
            <Package aria-hidden="true" size={28} />
            <div>
              <h2 className="card-title">Catálogo</h2>
              <p className="muted">
                {products.length} ítems cargados · {activeProducts} activos.
              </p>
              <p className="muted">
                {activeCouriers} repartidores activos para delivery.
              </p>
            </div>
            <Link className="button-secondary" href="/dashboard/catalogo">
              <Plus size={17} />
              Agregar producto
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
