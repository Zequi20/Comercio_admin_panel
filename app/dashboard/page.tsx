import {
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Globe2,
  Package,
  Plus,
  ReceiptText,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardContentShimmer } from "../components/dashboard-shimmer";
import { MerchantAvatar } from "../components/merchant-avatar";
import { MerchantMetadataEditor } from "../components/merchant-metadata-editor";
import { MerchantOpenSwitch } from "../components/merchant-open-switch";
import type { PortalScope } from "../lib/auth/types";
import { getScopedCommerceRequestContextFromCookies } from "../lib/auth/portal-scope";
import { orderStatusLabel } from "../lib/order-status";
import {
  listCouriersForAdminScope,
  listCouriersForMerchant,
  listOrdersForAdminScope,
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

function orderDateValue(value?: string) {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isAssignableOrder(order: Order) {
  return (
    order.fulfillmentType !== "PICKUP" &&
    order.status === "CONFIRMED" &&
    !order.courier?.id
  );
}

function isOrderInProgress(order: Order) {
  return (
    order.status === "CONFIRMED" ||
    order.status === "ASSIGNED" ||
    order.status === "PICKED_UP"
  );
}

function isOrderOpen(order: Order) {
  return order.status !== "DELIVERED" && order.status !== "CANCELED";
}

function priorityScore(order: Order) {
  if (order.status === "PLACED") return 0;
  if (isAssignableOrder(order)) return 1;
  if (order.status === "ASSIGNED") return 2;
  if (order.status === "PICKED_UP") return 3;
  if (order.status === "CONFIRMED") return 4;
  return 5;
}

function orderActionLabel(order: Order) {
  if (order.status === "PLACED") {
    return "Confirmar pedido";
  }

  if (isAssignableOrder(order)) {
    return "Asignar repartidor";
  }

  if (order.status === "ASSIGNED") {
    return "Seguir entrega";
  }

  if (order.status === "PICKED_UP") {
    return "Marcar entrega";
  }

  if (order.status === "CONFIRMED") {
    return order.fulfillmentType === "PICKUP"
      ? "Preparar retiro"
      : "Preparar pedido";
  }

  return "Revisar";
}

async function loadDashboardData(
  accessToken: string,
  scope: PortalScope,
  isAdmin: boolean,
) {
  const dashboardListLimit = 100;
  const [orders, products, couriers] = await Promise.all([
    (isAdmin
      ? listOrdersForAdminScope({
          accessToken,
          merchantId: scope.merchantId ?? undefined,
        })
      : listOrdersForMerchant({ accessToken, limit: dashboardListLimit })
    ).catch(() => null),
    listProductsForMerchant({
      accessToken,
      merchantId: scope.merchantId ?? undefined,
      limit: dashboardListLimit,
    }).catch(() => null),
    (isAdmin
      ? listCouriersForAdminScope({
          accessToken,
          merchantId: scope.merchantId ?? undefined,
        })
      : listCouriersForMerchant({ accessToken, limit: dashboardListLimit })
    ).catch(() => null),
  ]);

  return {
    orders: orders?.data ?? [],
    products: products?.data ?? [],
    couriers: couriers?.data ?? [],
  };
}

async function DashboardContent({
  accessToken,
  isAdmin,
  scope,
}: {
  accessToken: string;
  isAdmin: boolean;
  scope: PortalScope;
}) {
  const { orders, products, couriers } = await loadDashboardData(
    accessToken,
    scope,
    isAdmin,
  );
  const dashboardMerchant = scope.merchant;

  const openOrders = orders.filter(isOrderOpen);
  const pendingOrders = orders.filter((order) => order.status === "PLACED");
  const assignableOrders = orders.filter(isAssignableOrder);
  const inProgressOrders = orders.filter(isOrderInProgress);
  const todayOrders = orders.filter((order) => sameDay(order.createdAt));
  const soldTodayOrders = todayOrders.filter(
    (order) => order.status !== "CANCELED",
  );
  const canceledToday = orders.filter(
    (order) => order.status === "CANCELED" && sameDay(order.updatedAt),
  );
  const actionRequiredCount = pendingOrders.length + assignableOrders.length;
  const problemCount = canceledToday.length + assignableOrders.length;
  const salesTodayTotal = soldTodayOrders.reduce((total, order) => {
    const amount = Number(order.total ?? 0);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
  const averageTicket =
    soldTodayOrders.length > 0 ? salesTodayTotal / soldTodayOrders.length : 0;
  const priorityOrders = openOrders
    .slice()
    .sort((first, second) => {
      const priorityDiff = priorityScore(first) - priorityScore(second);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return orderDateValue(first.createdAt) - orderDateValue(second.createdAt);
    })
    .slice(0, 5);
  const activeProducts = products.filter((product) => product.available).length;
  const activeCouriers = couriers.filter((courier) => courier.isActive).length;

  const stats = [
    {
      label: "Requieren acción",
      value: String(actionRequiredCount),
      meta: `${pendingOrders.length} por confirmar · ${assignableOrders.length} por asignar`,
      icon: CircleAlert,
      pill: "Atención",
      pillClass: "pending",
    },
    {
      label: "Pedidos en curso",
      value: String(inProgressOrders.length),
      meta: `${openOrders.length} abiertos en total`,
      icon: Clock3,
      pill: "En marcha",
      pillClass: "confirmed",
    },
    {
      label: "Ventas hoy",
      value: formatPrice(salesTodayTotal),
      meta: `${soldTodayOrders.length} pedidos no cancelados`,
      icon: CircleDollarSign,
      pill: "Hoy",
      pillClass: "success",
    },
    {
      label: "Problemas",
      value: String(problemCount),
      meta: `${assignableOrders.length} sin repartidor · ${canceledToday.length} cancelados`,
      icon: Truck,
      pill: "Revisar",
      pillClass: problemCount > 0 ? "error" : "success",
    },
  ];

  return (
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
                  <span className={`pill ${item.pillClass}`}>{item.pill}</span>
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
              <h2 className="card-title">Prioridad operativa</h2>
              <p className="muted">Pedidos ordenados por acción pendiente.</p>
            </div>
            <Link className="button-tonal" href="/dashboard/ordenes">
              <ReceiptText size={17} />
              Ver pedidos
            </Link>
          </div>

          {priorityOrders.length ? (
            <div className="orders-list">
              {priorityOrders.map((order) => (
                <article
                  className="order-row priority-order-row"
                  key={order.id}
                >
                  <div>
                    <div className="order-code">#{order.id}</div>
                    <div className="order-meta">
                      {formatDate(order.createdAt)}
                    </div>
                  </div>
                  <div className="order-customer">
                    <strong>{customerName(order)}</strong>
                    <div className="order-meta">
                      {isAdmin && order.merchant?.name
                        ? `${order.merchant.name} · `
                        : ""}
                      {order.fulfillmentType === "PICKUP" ? "Retiro" : "Delivery"}
                    </div>
                  </div>
                  <span
                    className={`pill ${
                      statusPillClass[order.status ?? "PLACED"] ?? "pending"
                    }`}
                  >
                    {orderStatusLabel(order.status)}
                  </span>
                  <div className="order-row-value">
                    <strong>{formatPrice(order.total, order.currency)}</strong>
                    <span>{orderActionLabel(order)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-table-state">
              <ReceiptText aria-hidden="true" size={26} />
              <strong>Sin pendientes operativos</strong>
              <span>No hay pedidos que requieran acción inmediata.</span>
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
                <Link
                  className="quick-action"
                  href={action.href}
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
        {dashboardMerchant ? (
          <section className="card card-lg">
            <div className="merchant-summary">
              <MerchantAvatar
                key={`dashboard-avatar-${dashboardMerchant.id}`}
                metadata={dashboardMerchant.metadata}
                name={
                  dashboardMerchant.name ??
                  `Comercio #${dashboardMerchant.id}`
                }
              />
              <div>
                <h2>
                  {dashboardMerchant.name ??
                    `Comercio #${dashboardMerchant.id}`}
                </h2>
                <p className="muted">Disponibilidad actual</p>
              </div>
            </div>
            <MerchantOpenSwitch
              key={`dashboard-open-${dashboardMerchant.id}`}
              initialIsOpen={dashboardMerchant.isOpen}
              merchantId={dashboardMerchant.id}
            />
            <MerchantMetadataEditor
              key={`dashboard-metadata-${dashboardMerchant.id}`}
              initialMetadata={dashboardMerchant.metadata}
              merchantId={dashboardMerchant.id}
            />
            <div className="metric-list dashboard-side-metrics">
              <div className="metric-row">
                <span className="metric-label">Comercio ID</span>
                <span className="metric-value">{dashboardMerchant.id}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Costo delivery</span>
                <span className="metric-value">
                  {dashboardMerchant.deliveryCost ?? "Pendiente"}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Contacto</span>
                <span className="metric-value">
                  {dashboardMerchant.contactEmail ?? "Sin correo"}
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="card card-lg">
            <div className="merchant-summary">
              <span className="commerce-avatar" aria-hidden="true">
                <Globe2 size={24} />
              </span>
              <div>
                <h2>Todos los comercios</h2>
                <p className="muted">Resumen consolidado administrativo</p>
              </div>
            </div>
            <p className="muted admin-global-description">
              Seleccioná un comercio en el control de alcance para habilitar
              operaciones y configuración específica.
            </p>
            <div className="metric-list dashboard-side-metrics">
              <div className="metric-row">
                <span className="metric-label">Órdenes consultadas</span>
                <span className="metric-value">{orders.length}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Ítems de catálogo</span>
                <span className="metric-value">{products.length}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Repartidores</span>
                <span className="metric-value">{couriers.length}</span>
              </div>
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Métricas</h2>
            <span className="pill">Hoy</span>
          </div>
          <div className="metric-list">
            <div className="metric-row">
              <span className="metric-label">Ventas hoy</span>
              <span className="metric-value">
                {formatPrice(salesTodayTotal)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Ticket medio</span>
              <span className="metric-value">{formatPrice(averageTicket)}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Pedidos creados</span>
              <span className="metric-value">{todayOrders.length}</span>
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
  );
}

export default async function DashboardPage() {
  const context = await getScopedCommerceRequestContextFromCookies();

  if (!context) {
    redirect("/login");
  }

  const { session, accessToken, isAdmin, scope } = context;
  const scopeName =
    scope.mode === "global"
      ? "Todos los comercios"
      : scope.merchant.name ?? `Comercio #${scope.merchantId}`;

  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="dashboard-title">Panel de control</h1>
          <p className="muted">
            {scopeName} · {session.user.email}
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

      <Suspense fallback={<DashboardContentShimmer />}>
        <DashboardContent
          accessToken={accessToken}
          isAdmin={isAdmin}
          scope={scope}
        />
      </Suspense>
    </main>
  );
}
