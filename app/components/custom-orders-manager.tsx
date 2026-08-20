"use client";

import {
  CircleAlert,
  CircleCheck,
  Edit3,
  MapPin,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateRows,
  TablePagination,
  type TablePaginationState,
} from "@/app/components/table-pagination";
import { useAdminScope } from "@/app/components/admin-scope-context";
import { confirmFormClose } from "@/app/lib/confirm-dialog-close";
import { customOrderNextStatuses } from "@/app/lib/orders/order-type";
import { orderStatusLabel } from "@/app/lib/order-status";

type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELED";

type EntityReference = {
  id?: number | string;
  email?: string | null;
  nickname?: string | null;
  name?: string | null;
  phone?: string | null;
};

type CourierReference = {
  id?: number | string;
  name?: string | null;
  user?: EntityReference | null;
};

type CustomLocation = {
  label?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
};

type CustomOrder = {
  id: number | string;
  version?: number;
  orderType?: "CUSTOM";
  fulfillmentType?: "DELIVERY";
  status?: OrderStatus;
  customer?: EntityReference;
  courier?: CourierReference | null;
  customRequest?: {
    origin: CustomLocation & { label: string };
    productDescription: string;
    destination: CustomLocation;
    contactPhone: string;
  } | null;
  address?: string | null;
  notes?: string | null;
  estimatedDeliveryCost?: number | string | null;
  total?: number | string | null;
  priceStatus?: "PENDING" | "CONFIRMED";
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  history?: Array<{
    id?: number | string;
    fromStatus?: OrderStatus | null;
    toStatus: OrderStatus;
    changedBy?: EntityReference;
    changedAt?: string;
  }>;
};

type Filters = {
  q: string;
  status: "ALL" | OrderStatus;
};

type CreateForm = {
  originLabel: string;
  originAddress: string;
  originLatitude: string;
  originLongitude: string;
  productDescription: string;
  destinationAddress: string;
  destinationLatitude: string;
  destinationLongitude: string;
  contactPhone: string;
  notes: string;
  currency: string;
};

type EditForm = {
  status: OrderStatus;
  total: string;
};

const initialFilters: Filters = { q: "", status: "ALL" };

const emptyCreateForm: CreateForm = {
  originLabel: "",
  originAddress: "",
  originLatitude: "",
  originLongitude: "",
  productDescription: "",
  destinationAddress: "",
  destinationLatitude: "",
  destinationLongitude: "",
  contactPhone: "",
  notes: "",
  currency: "PYG",
};

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  "PLACED",
  "CONFIRMED",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "CANCELED",
].map((status) => ({
  value: status as OrderStatus,
  label: orderStatusLabel(status),
}));

function isCustomOrder(value: unknown): value is CustomOrder {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      (value as { orderType?: unknown }).orderType === "CUSTOM"
  );
}

function readOrders(payload: unknown) {
  if (Array.isArray(payload)) return payload.filter(isCustomOrder);
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return [];
  }

  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter(isCustomOrder) : [];
}

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

function formatPrice(
  value: number | string | null | undefined,
  currency = "PYG"
) {
  if (value === null || value === undefined || value === "") return "Pendiente";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;

  if (currency === "PYG") {
    return `Gs. ${amount.toLocaleString("es-PY", {
      maximumFractionDigits: 0,
    })}`;
  }

  try {
    return new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-PY")}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function customerName(order: CustomOrder) {
  return (
    order.customer?.name ??
    order.customer?.nickname ??
    order.customer?.email ??
    `Cliente #${order.customer?.id ?? "-"}`
  );
}

function customerDetail(order: CustomOrder) {
  return [
    order.customer?.id ? `ID ${order.customer.id}` : null,
    order.customer?.phone,
    order.customer?.email,
  ]
    .filter(Boolean)
    .join(" · ") || "Sin referencia";
}

function courierName(order: CustomOrder) {
  const courier = order.courier;
  return (
    courier?.name ??
    courier?.user?.name ??
    courier?.user?.nickname ??
    courier?.user?.email ??
    (courier?.id ? `Repartidor #${courier.id}` : "Sin repartidor")
  );
}

function courierDetail(order: CustomOrder) {
  return [
    order.courier?.id ? `ID ${order.courier.id}` : null,
    order.courier?.user?.phone,
    order.courier?.user?.email,
  ]
    .filter(Boolean)
    .join(" · ") || "Sin asignación";
}

function coordinateText(location?: CustomLocation | null) {
  if (!location) return "Sin coordenadas";
  return `${Number(location.latitude).toFixed(5)}, ${Number(
    location.longitude
  ).toFixed(5)}`;
}

function locationMapsUrl(location?: CustomLocation | null) {
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${latitude},${longitude}`
  )}`;
}

function LocationCell({
  location,
  fallback,
}: {
  location?: CustomLocation | null;
  fallback: string;
}) {
  const mapsUrl = locationMapsUrl(location);
  const address = location?.address?.trim() || fallback;

  return (
    <span className="custom-location-cell">
      <strong>{location?.label?.trim() || address}</strong>
      {location?.label?.trim() && address ? (
        <span className="table-muted">{address}</span>
      ) : null}
      {mapsUrl ? (
        <a
          className="order-address-link"
          href={mapsUrl}
          rel="noopener noreferrer"
          target="_blank"
          title="Abrir coordenadas en Google Maps"
        >
          <span>{coordinateText(location)}</span>
          <MapPin aria-hidden="true" size={13} />
        </a>
      ) : (
        <span className="table-muted">Sin coordenadas</span>
      )}
    </span>
  );
}

function statusPillClass(status?: OrderStatus) {
  if (status === "DELIVERED") return "success";
  if (status === "CANCELED") return "error";
  if (status === "ASSIGNED") return "assigned";
  if (status === "PICKED_UP") return "picked-up";
  if (status === "CONFIRMED") return "confirmed";
  return "pending";
}

function orderMatchesQuery(order: CustomOrder, query: string) {
  const normalized = query.trim().toLocaleLowerCase("es");
  if (!normalized) return true;

  const request = order.customRequest;
  return [
    order.id,
    customerName(order),
    customerDetail(order),
    courierName(order),
    request?.origin.label,
    request?.origin.address,
    request?.origin.latitude,
    request?.origin.longitude,
    request?.productDescription,
    request?.destination.address,
    request?.destination.latitude,
    request?.destination.longitude,
    request?.contactPhone,
    order.notes,
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" ")
    .toLocaleLowerCase("es")
    .includes(normalized);
}

function coordinate(value: string, min: number, max: number) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function versionOf(order: CustomOrder) {
  const version = Number(order.version);
  return Number.isInteger(version) && version >= 0 ? version : null;
}

function editStatusOptions(order: CustomOrder) {
  const allowed = new Set([
    order.status ?? "PLACED",
    ...customOrderNextStatuses(order),
  ]);
  return statusOptions.filter((option) => allowed.has(option.value));
}

export function CustomOrdersManager() {
  const { isAdmin } = useAdminScope();
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [editForm, setEditForm] = useState<EditForm>({
    status: "ASSIGNED",
    total: "",
  });
  const [editingOrder, setEditingOrder] = useState<CustomOrder | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pagination, setPagination] = useState<TablePaginationState>({
    page: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  });
  const loadOrdersRef = useRef<(background?: boolean) => Promise<void>>(
    async () => {}
  );
  const hasOpenModal = isCreateOpen || editingOrder !== null;

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          (filters.status === "ALL" || order.status === filters.status) &&
          orderMatchesQuery(order, filters.q)
      ),
    [filters.q, filters.status, orders]
  );
  const ordersPage = useMemo(
    () => paginateRows(visibleOrders, pagination),
    [pagination, visibleOrders]
  );
  const openCount = useMemo(
    () =>
      orders.filter(
        (order) => order.status !== "DELIVERED" && order.status !== "CANCELED"
      ).length,
    [orders]
  );

  async function loadOrders(background = false) {
    if (!background) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/orders?limit=100&orderType=CUSTOM", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudieron cargar los pedidos custom.")
        );
      }

      const nextOrders = readOrders(payload);
      setOrders(nextOrders);
      setPagination((current) => {
        const page = paginateRows(nextOrders, current).currentPage;
        return page === current.page ? current : { ...current, page };
      });
      setEditingOrder((current) => {
        if (!current) return null;
        return (
          nextOrders.find((order) => String(order.id) === String(current.id)) ??
          current
        );
      });
    } catch (loadError) {
      if (!background) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los pedidos custom."
        );
      }
    } finally {
      if (!background) setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  });

  useEffect(() => {
    async function loadInitialOrders() {
      await loadOrders();
    }

    void loadInitialOrders();
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/orders/events");
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void loadOrdersRef.current(true);
      }, 250);
    };

    events.addEventListener("orders.changed", refresh);
    return () => {
      events.removeEventListener("orders.changed", refresh);
      events.close();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", hasOpenModal);
    return () => document.body.classList.remove("modal-open");
  }, [hasOpenModal]);

  function updateCreateForm<K extends keyof CreateForm>(
    key: K,
    value: CreateForm[K]
  ) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setEditingOrder(null);
    setError(null);
    setSuccess(null);
    setIsCreateOpen(true);
  }

  function closeCreate() {
    if (isSubmitting || !confirmFormClose()) return;
    setIsCreateOpen(false);
    setCreateForm(emptyCreateForm);
    setError(null);
  }

  function openEdit(order: CustomOrder) {
    setIsCreateOpen(false);
    setEditingOrder(order);
    setEditForm({
      status: order.status ?? "PLACED",
      total: order.total === null || order.total === undefined ? "" : String(order.total),
    });
    setError(null);
    setSuccess(null);
  }

  function closeEdit() {
    if (isSubmitting || !confirmFormClose()) return;
    setEditingOrder(null);
    setError(null);
  }

  function validateCreate() {
    if (!createForm.originLabel.trim()) return "Ingresá el nombre del origen.";
    if (!createForm.productDescription.trim()) {
      return "Describí el producto o encargo.";
    }
    if (createForm.contactPhone.trim().length < 6) {
      return "Ingresá un teléfono de contacto válido.";
    }
    if (coordinate(createForm.originLatitude, -90, 90) === null) {
      return "Ingresá una latitud válida para el origen.";
    }
    if (coordinate(createForm.originLongitude, -180, 180) === null) {
      return "Ingresá una longitud válida para el origen.";
    }
    if (coordinate(createForm.destinationLatitude, -90, 90) === null) {
      return "Ingresá una latitud válida para el destino.";
    }
    if (coordinate(createForm.destinationLongitude, -180, 180) === null) {
      return "Ingresá una longitud válida para el destino.";
    }
    return null;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateCreate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/orders/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          origin: {
            label: createForm.originLabel.trim(),
            address: createForm.originAddress.trim() || undefined,
            latitude: coordinate(createForm.originLatitude, -90, 90),
            longitude: coordinate(createForm.originLongitude, -180, 180),
          },
          productDescription: createForm.productDescription.trim(),
          destination: {
            address: createForm.destinationAddress.trim() || undefined,
            latitude: coordinate(createForm.destinationLatitude, -90, 90),
            longitude: coordinate(createForm.destinationLongitude, -180, 180),
          },
          contactPhone: createForm.contactPhone.trim(),
          notes: createForm.notes.trim() || undefined,
          currency: createForm.currency.trim().toUpperCase() || "PYG",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo crear el pedido custom.")
        );
      }

      setIsCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setSuccess("Pedido custom creado correctamente.");
      await loadOrders(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo crear el pedido custom."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOrder) return;

    setError(null);
    setSuccess(null);
    let expectedVersion = versionOf(editingOrder);
    if (expectedVersion === null) {
      setError("No se pudo leer la versión actual del pedido.");
      return;
    }

    const nextTotal = Number(editForm.total.replace(",", "."));
    const currentTotal = Number(editingOrder.total);
    const shouldUpdatePrice =
      editForm.total.trim() !== "" &&
      (!Number.isFinite(currentTotal) || nextTotal !== currentTotal);

    if (shouldUpdatePrice && (!Number.isFinite(nextTotal) || nextTotal <= 0)) {
      setError("Ingresá un precio final mayor a cero.");
      return;
    }
    if (
      editForm.status === "PICKED_UP" &&
      editingOrder.priceStatus !== "CONFIRMED" &&
      !shouldUpdatePrice
    ) {
      setError("Confirmá el precio final antes de marcar el retiro.");
      return;
    }
    if (!shouldUpdatePrice && editForm.status === editingOrder.status) {
      setError("Cambiá el precio o el estado para actualizar.");
      return;
    }

    setIsSubmitting(true);
    setPendingOrderId(String(editingOrder.id));
    try {
      let latestOrder = editingOrder;
      const orderId = encodeURIComponent(String(editingOrder.id));

      if (shouldUpdatePrice) {
        const response = await fetch(`/api/orders/${orderId}/price`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ total: nextTotal, expectedVersion }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            messageFromPayload(payload, "No se pudo confirmar el precio final.")
          );
        }
        if (isCustomOrder(payload)) {
          latestOrder = payload;
          expectedVersion = versionOf(payload) ?? expectedVersion + 1;
        } else {
          expectedVersion += 1;
        }
      }

      if (editForm.status !== latestOrder.status) {
        const response = await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            toStatus: editForm.status,
            expectedVersion,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            messageFromPayload(payload, "No se pudo actualizar el estado.")
          );
        }
      }

      setEditingOrder(null);
      setSuccess("Pedido custom actualizado correctamente.");
      await loadOrders(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo actualizar el pedido custom."
      );
    } finally {
      setIsSubmitting(false);
      setPendingOrderId(null);
    }
  }

  async function handleDelete(order: CustomOrder) {
    if (!window.confirm(`¿Eliminar el pedido custom #${order.id}?`)) return;

    setPendingOrderId(String(order.id));
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(String(order.id))}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          messageFromPayload(payload, "No se pudo eliminar el pedido custom.")
        );
      }

      setOrders((current) =>
        current.filter((candidate) => String(candidate.id) !== String(order.id))
      );
      if (editingOrder && String(editingOrder.id) === String(order.id)) {
        setEditingOrder(null);
      }
      setSuccess("Pedido custom eliminado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el pedido custom."
      );
    } finally {
      setPendingOrderId(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="catalog-layout">
      <section className="card card-lg catalog-table-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Tabla de pedidos custom</h2>
            <p className="muted">
              {visibleOrders.length} pedidos · {openCount} abiertos
            </p>
          </div>
          <div className="dashboard-actions">
            <button className="button-tonal" onClick={openCreate} type="button">
              <Plus size={17} />
              Agregar
            </button>
            <button
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadOrders()}
              title="Actualizar tabla"
              type="button"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div className="notification-info-box admin-data-scope-notice" role="note">
          <PackageSearch aria-hidden="true" size={18} />
          <div>
            <strong>Operación global</strong>
            <span>
              Estos pedidos no pertenecen a un catálogo ni a un comercio integrado.
            </span>
          </div>
        </div>

        {!hasOpenModal && error ? (
          <div className="error-box catalog-status-message" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        {!hasOpenModal && success ? (
          <div className="success-box catalog-status-message" role="status">
            <CircleCheck aria-hidden="true" size={18} />
            <span>{success}</span>
          </div>
        ) : null}

        <form
          className="catalog-filters orders-filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="custom-orders-search">
              Buscar
            </label>
            <input
              className="field-control"
              id="custom-orders-search"
              placeholder="Pedido, cliente, origen, destino o teléfono"
              value={filters.q}
              onChange={(event) => {
                setPagination((current) => ({ ...current, page: 1 }));
                setFilters((current) => ({ ...current, q: event.target.value }));
              }}
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="custom-orders-status">
              Estado
            </label>
            <select
              className="field-control"
              id="custom-orders-status"
              value={filters.status}
              onChange={(event) => {
                setPagination((current) => ({ ...current, page: 1 }));
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters["status"],
                }));
              }}
            >
              <option value="ALL">Todos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="button-tonal" type="submit">
            <Search size={17} />
            Filtrar
          </button>
        </form>

        <div className="orders-table-guide" aria-label="Comportamiento de la tabla">
          <span className="orders-table-scroll-guide">
            Deslizá horizontalmente para consultar todos los datos del pedido
          </span>
        </div>

        <div className="table-wrap orders-table-wrap custom-orders-table-wrap">
          <table className="data-table orders-data-table custom-orders-data-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Origen</th>
                <th>Solicitud</th>
                <th>Destino</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th>Repartidor</th>
                <th>Estimación</th>
                <th>Precio final</th>
                <th>Historial</th>
                <th>Creado</th>
                <th>Actualizado</th>
                <th className="orders-actions-column">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={14}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : ordersPage.rows.length ? (
                ordersPage.rows.map((order) => {
                  const request = order.customRequest;
                  const isPending = pendingOrderId === String(order.id);
                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>#{order.id}</strong>
                        <span className="table-muted">
                          CUSTOM · DELIVERY · v{order.version ?? "-"}
                        </span>
                      </td>
                      <td>
                        <strong>{customerName(order)}</strong>
                        <span className="table-muted">{customerDetail(order)}</span>
                      </td>
                      <td>
                        <LocationCell
                          fallback="Origen sin dirección"
                          location={request?.origin}
                        />
                      </td>
                      <td>
                        <strong>{request?.productDescription || "Sin descripción"}</strong>
                        <span className="table-muted">
                          {order.notes || "Sin notas adicionales"}
                        </span>
                      </td>
                      <td>
                        <LocationCell
                          fallback={order.address || "Destino sin dirección"}
                          location={request?.destination}
                        />
                      </td>
                      <td>
                        <strong>{request?.contactPhone || "Sin teléfono"}</strong>
                      </td>
                      <td>
                        <span className={`pill ${statusPillClass(order.status)}`}>
                          {orderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>
                        <strong>{courierName(order)}</strong>
                        <span className="table-muted">{courierDetail(order)}</span>
                      </td>
                      <td>
                        <strong>
                          {formatPrice(order.estimatedDeliveryCost, order.currency)}
                        </strong>
                      </td>
                      <td>
                        <strong>{formatPrice(order.total, order.currency)}</strong>
                        <span
                          className={`pill ${
                            order.priceStatus === "CONFIRMED" ? "success" : "pending"
                          }`}
                        >
                          {order.priceStatus === "CONFIRMED"
                            ? "Confirmado"
                            : "Pendiente"}
                        </span>
                      </td>
                      <td>
                        {order.history?.length ? (
                          <span className="custom-order-history">
                            {order.history.map((entry, index) => (
                              <span key={entry.id ?? `${entry.toStatus}-${index}`}>
                                <strong>{orderStatusLabel(entry.toStatus)}</strong>
                                <span className="table-muted">
                                  {formatDate(entry.changedAt)} · por ID {entry.changedBy?.id ?? "-"}
                                </span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="table-muted">Sin historial</span>
                        )}
                      </td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>{formatDate(order.updatedAt)}</td>
                      <td className="orders-actions-column">
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            disabled={isPending}
                            onClick={() => openEdit(order)}
                            title="Actualizar precio o estado"
                            type="button"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            className="icon-button danger-button"
                            disabled={isPending}
                            onClick={() => void handleDelete(order)}
                            title="Eliminar"
                            type="button"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={14}>
                    <div className="empty-table-state">
                      <PackageSearch aria-hidden="true" size={26} />
                      <strong>Sin pedidos custom</strong>
                      <span>Creá un pedido o ajustá los filtros.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={ordersPage.currentPage}
          itemLabelPlural="pedidos custom"
          itemLabelSingular="pedido custom"
          pageSize={ordersPage.pageSize}
          totalItems={ordersPage.totalItems}
          totalPages={ordersPage.totalPages}
          onPageChange={(page) =>
            setPagination((current) => ({ ...current, page }))
          }
          onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
        />
      </section>

      {isCreateOpen ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar formulario"
            className="catalog-modal-backdrop"
            disabled={isSubmitting}
            onClick={closeCreate}
            type="button"
          />
          <section
            aria-label="Nuevo pedido custom"
            aria-modal="true"
            className="card card-lg catalog-modal custom-order-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">Nuevo pedido custom</h2>
                <p className="muted">
                  Registrá el encargo libre, su origen y el destino de entrega.
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isSubmitting}
                onClick={closeCreate}
                title="Cerrar formulario"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleCreate}>
              <div className="field-group">
                <label className="field-label" htmlFor="custom-origin-label">
                  Nombre del origen
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="custom-origin-label"
                  placeholder="Negocio o punto de retiro"
                  value={createForm.originLabel}
                  onChange={(event) =>
                    updateCreateForm("originLabel", event.target.value)
                  }
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="custom-origin-address">
                  Dirección del origen
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="custom-origin-address"
                  placeholder="Av. España 123"
                  value={createForm.originAddress}
                  onChange={(event) =>
                    updateCreateForm("originAddress", event.target.value)
                  }
                />
              </div>
              <div className="form-grid">
                <CoordinateField
                  disabled={isSubmitting}
                  id="custom-origin-latitude"
                  label="Latitud de origen"
                  placeholder="-25.28220"
                  value={createForm.originLatitude}
                  onChange={(value) => updateCreateForm("originLatitude", value)}
                />
                <CoordinateField
                  disabled={isSubmitting}
                  id="custom-origin-longitude"
                  label="Longitud de origen"
                  placeholder="-57.63510"
                  value={createForm.originLongitude}
                  onChange={(value) => updateCreateForm("originLongitude", value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="custom-description">
                  Producto o encargo
                </label>
                <textarea
                  className="field-control textarea-control"
                  disabled={isSubmitting}
                  id="custom-description"
                  maxLength={2000}
                  placeholder="Describí qué debe retirar o comprar el repartidor"
                  rows={4}
                  value={createForm.productDescription}
                  onChange={(event) =>
                    updateCreateForm("productDescription", event.target.value)
                  }
                />
              </div>
              <div className="field-group">
                <label
                  className="field-label"
                  htmlFor="custom-destination-address"
                >
                  Dirección del destino
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="custom-destination-address"
                  placeholder="Tte. Fariña 456"
                  value={createForm.destinationAddress}
                  onChange={(event) =>
                    updateCreateForm("destinationAddress", event.target.value)
                  }
                />
              </div>
              <div className="form-grid">
                <CoordinateField
                  disabled={isSubmitting}
                  id="custom-destination-latitude"
                  label="Latitud de destino"
                  placeholder="-25.29000"
                  value={createForm.destinationLatitude}
                  onChange={(value) =>
                    updateCreateForm("destinationLatitude", value)
                  }
                />
                <CoordinateField
                  disabled={isSubmitting}
                  id="custom-destination-longitude"
                  label="Longitud de destino"
                  placeholder="-57.62000"
                  value={createForm.destinationLongitude}
                  onChange={(value) =>
                    updateCreateForm("destinationLongitude", value)
                  }
                />
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="custom-contact-phone">
                    Teléfono de contacto
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="custom-contact-phone"
                    placeholder="+595 981 123456"
                    value={createForm.contactPhone}
                    onChange={(event) =>
                      updateCreateForm("contactPhone", event.target.value)
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="custom-currency">
                    Moneda
                  </label>
                  <input
                    className="field-control"
                    disabled
                    id="custom-currency"
                    value={createForm.currency}
                  />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="custom-notes">
                  Notas
                </label>
                <textarea
                  className="field-control textarea-control"
                  disabled={isSubmitting}
                  id="custom-notes"
                  maxLength={1000}
                  placeholder="Indicaciones adicionales"
                  rows={3}
                  value={createForm.notes}
                  onChange={(event) => updateCreateForm("notes", event.target.value)}
                />
              </div>

              {error ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{error}</span>
                </div>
              ) : null}
              <div className="form-actions">
                <button className="button-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? <span aria-hidden="true" className="spinner" /> : <Save size={17} />}
                  {isSubmitting ? "Guardando" : "Guardar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={isSubmitting}
                  onClick={closeCreate}
                  type="button"
                >
                  <X size={17} />
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingOrder ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar actualización"
            className="catalog-modal-backdrop"
            disabled={isSubmitting}
            onClick={closeEdit}
            type="button"
          />
          <section
            aria-label={`Actualizar pedido custom #${editingOrder.id}`}
            aria-modal="true"
            className="card card-lg catalog-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  Actualizar pedido custom #{editingOrder.id}
                </h2>
                <p className="muted">
                  Confirmá el precio final y avanzá el estado operativo.
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isSubmitting}
                onClick={closeEdit}
                title="Cerrar"
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <form className="catalog-form" onSubmit={handleEdit}>
              <div className="field-group">
                <span className="field-label">Solicitud</span>
                <div className="metadata-empty-state">
                  {editingOrder.customRequest?.productDescription || "Sin descripción"}
                </div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="custom-final-price">
                    Precio final ({editingOrder.currency ?? "PYG"})
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting || editingOrder.status !== "ASSIGNED"}
                    id="custom-final-price"
                    inputMode="decimal"
                    min="1"
                    placeholder="Monto confirmado"
                    type="number"
                    value={editForm.total}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        total: event.target.value,
                      }))
                    }
                  />
                  <span className="field-help">
                    Estimación: {formatPrice(
                      editingOrder.estimatedDeliveryCost,
                      editingOrder.currency
                    )}
                  </span>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="custom-edit-status">
                    Estado
                  </label>
                  <select
                    className="field-control"
                    disabled={isSubmitting}
                    id="custom-edit-status"
                    value={editForm.status}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        status: event.target.value as OrderStatus,
                      }))
                    }
                  >
                    {editStatusOptions(editingOrder).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{error}</span>
                </div>
              ) : null}
              <div className="form-actions">
                <button className="button-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? <span aria-hidden="true" className="spinner" /> : <Save size={17} />}
                  {isSubmitting ? "Actualizando" : "Actualizar"}
                </button>
                <button
                  className="button-secondary"
                  disabled={isSubmitting}
                  onClick={closeEdit}
                  type="button"
                >
                  <X size={17} />
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CoordinateField({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field-control"
        disabled={disabled}
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
