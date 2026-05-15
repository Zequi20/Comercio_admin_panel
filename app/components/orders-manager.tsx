"use client";

import {
  CircleAlert,
  CircleCheck,
  Edit3,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELED";
type FulfillmentType = "DELIVERY" | "PICKUP";
type StatusFilter = "ALL" | OrderStatus;

type EntityReference = {
  id?: number | string;
  email?: string | null;
  nickname?: string | null;
  name?: string | null;
};

type OrderItem = {
  productId: number | string;
  sku?: string | null;
  name?: string | null;
  quantity: number | string;
  unitPrice?: number | string | null;
};

type CommerceOrder = {
  id: number | string;
  version?: number;
  status?: OrderStatus;
  customer?: EntityReference;
  courier?: { id?: number | string; name?: string | null } | null;
  fulfillmentType?: FulfillmentType;
  address?: string | null;
  notes?: string | null;
  total?: number | string;
  currency?: string;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
};

type CatalogProduct = {
  id: number | string;
  sku?: string;
  name: string;
  price: number | string;
  currency: string;
  available: boolean;
};

type ListOrdersResponse = {
  data?: CommerceOrder[];
};

type ListProductsResponse = {
  data?: CatalogProduct[];
};

type OrderItemField = {
  id: string;
  productId: string;
  quantity: string;
};

type OrderForm = {
  fulfillmentType: FulfillmentType;
  address: string;
  notes: string;
  currency: string;
  status: OrderStatus;
  items: OrderItemField[];
};

type OrderFilters = {
  q: string;
  status: StatusFilter;
};

const initialFilters: OrderFilters = {
  q: "",
  status: "ALL",
};

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: "PLACED", label: "Pendiente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "PICKED_UP", label: "Retirado" },
  { value: "DELIVERED", label: "Entregado" },
  { value: "CANCELED", label: "Cancelado" },
];

const statusConfig: Record<
  OrderStatus,
  { label: string; pillClass: string }
> = {
  PLACED: { label: "Pendiente", pillClass: "pending" },
  CONFIRMED: { label: "Confirmado", pillClass: "hot" },
  ASSIGNED: { label: "Asignado", pillClass: "hot" },
  PICKED_UP: { label: "Retirado", pillClass: "done" },
  DELIVERED: { label: "Entregado", pillClass: "success" },
  CANCELED: { label: "Cancelado", pillClass: "error" },
};

let itemFieldCounter = 0;

function nextItemFieldId() {
  itemFieldCounter += 1;
  return `order-item-${itemFieldCounter}`;
}

function createItemField(): OrderItemField {
  return {
    id: nextItemFieldId(),
    productId: "",
    quantity: "1",
  };
}

function createEmptyForm(): OrderForm {
  return {
    fulfillmentType: "DELIVERY",
    address: "",
    notes: "",
    currency: "PYG",
    status: "PLACED",
    items: [createItemField()],
  };
}

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function isOrder(value: unknown): value is CommerceOrder {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value;
}

function readOrders(payload: unknown): CommerceOrder[] {
  if (Array.isArray(payload)) {
    return payload.filter(isOrder);
  }

  if (payload && typeof payload === "object") {
    const data = (payload as ListOrdersResponse).data;
    if (Array.isArray(data)) {
      return data.filter(isOrder);
    }
  }

  return [];
}

function isProduct(value: unknown): value is CatalogProduct {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "name" in value && "price" in value;
}

function readProducts(payload: unknown): CatalogProduct[] {
  if (Array.isArray(payload)) {
    return payload.filter(isProduct);
  }

  if (payload && typeof payload === "object") {
    const data = (payload as ListProductsResponse).data;
    if (Array.isArray(data)) {
      return data.filter(isProduct);
    }
  }

  return [];
}

function buildOrdersUrl(filters: OrderFilters) {
  const params = new URLSearchParams({ limit: "100" });

  if (filters.status !== "ALL") {
    params.set("status", filters.status);
  }

  return `/api/orders?${params.toString()}`;
}

function orderCode(order: CommerceOrder) {
  return `#${order.id}`;
}

function fulfillmentLabel(value?: FulfillmentType) {
  return value === "PICKUP" ? "Retiro" : "Delivery";
}

function customerName(order: CommerceOrder) {
  const customer = order.customer;

  return (
    customer?.name ??
    customer?.nickname ??
    customer?.email ??
    `Cliente #${customer?.id ?? "-"}`
  );
}

function customerDetail(order: CommerceOrder) {
  const customer = order.customer;

  if (customer?.email && customer.email !== customerName(order)) {
    return customer.email;
  }

  return customer?.id ? `ID ${customer.id}` : "Sin referencia";
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

function readVersion(order: CommerceOrder) {
  const version = Number(order.version);

  return Number.isInteger(version) && version >= 0 ? version : null;
}

function productOptionLabel(product: CatalogProduct) {
  const sku = product.sku ? ` · ${product.sku}` : "";
  return `${product.name}${sku} · ${formatPrice(product.price, product.currency)}`;
}

function itemFieldsToPayload(fields: OrderItemField[]):
  | {
      ok: true;
      items: Array<{ productId: number; quantity: number }>;
    }
  | { ok: false; message: string } {
  const items: Array<{ productId: number; quantity: number }> = [];

  for (const field of fields) {
    const productId = field.productId.trim();
    const quantity = field.quantity.trim();

    if (!productId && (!quantity || quantity === "1")) {
      continue;
    }

    if (!productId) {
      return { ok: false, message: "Seleccioná el producto del ítem." };
    }

    const numericProductId = Number(productId);
    const numericQuantity = Number(quantity);

    if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
      return { ok: false, message: "Seleccioná un producto válido." };
    }

    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      return { ok: false, message: "Ingresá una cantidad válida." };
    }

    items.push({
      productId: numericProductId,
      quantity: numericQuantity,
    });
  }

  return { ok: true, items };
}

function orderMatchesQuery(order: CommerceOrder, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  const searchable = [
    order.id,
    customerName(order),
    order.customer?.email,
    order.address,
    order.notes,
    ...(order.items ?? []).flatMap((item) => [
      item.productId,
      item.sku,
      item.name,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(normalized);
}

function orderToForm(order: CommerceOrder): OrderForm {
  return {
    fulfillmentType: order.fulfillmentType ?? "DELIVERY",
    address: order.address ?? "",
    notes: order.notes ?? "",
    currency: order.currency ?? "PYG",
    status: order.status ?? "PLACED",
    items: [createItemField()],
  };
}

function itemDisplayName(item: OrderItem) {
  return item.name ?? item.sku ?? `Producto #${item.productId}`;
}

export function OrdersManager() {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [form, setForm] = useState<OrderForm>(() => createEmptyForm());
  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [editingOrder, setEditingOrder] = useState<CommerceOrder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const visibleOrders = useMemo(
    () => orders.filter((order) => orderMatchesQuery(order, filters.q)),
    [filters.q, orders]
  );

  const openCount = useMemo(
    () =>
      orders.filter((order) => {
        return order.status !== "DELIVERED" && order.status !== "CANCELED";
      }).length,
    [orders]
  );

  async function loadProducts() {
    try {
      const response = await fetch("/api/products?limit=100&available=true", {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        setProducts(readProducts(payload));
      }
    } catch {
      setProducts([]);
    }
  }

  async function loadOrders(nextFilters = filters) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(buildOrdersUrl(nextFilters), {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo cargar la lista de pedidos.")
        );
      }

      setOrders(readOrders(payload));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la lista de pedidos."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      setIsLoading(true);

      try {
        const ordersResponse = await fetch(buildOrdersUrl(initialFilters), {
          credentials: "include",
        });
        const ordersPayload = await ordersResponse.json().catch(() => null);

        if (!ordersResponse.ok) {
          throw new Error(
            messageFromPayload(
              ordersPayload,
              "No se pudo cargar la lista de pedidos."
            )
          );
        }

        if (!ignore) {
          setOrders(readOrders(ordersPayload));
        }

        await loadProducts();
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la lista de pedidos."
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isFormOpen);

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isFormOpen]);

  function updateForm<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingOrder(null);
    setForm(createEmptyForm());
  }

  function openCreateForm() {
    resetForm();
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  async function openEditForm(order: CommerceOrder) {
    setPendingOrderId(String(order.id));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(String(order.id))}`,
        {
          credentials: "include",
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo cargar el detalle del pedido.")
        );
      }

      const orderDetail = isOrder(payload) ? payload : order;

      setEditingOrder(orderDetail);
      setForm(orderToForm(orderDetail));
      setIsFormOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el detalle del pedido."
      );
    } finally {
      setPendingOrderId(null);
    }
  }

  function openEditFormFromRow(order: CommerceOrder) {
    void openEditForm(order);
  }

  function closeFormModal() {
    if (isSubmitting) return;
    resetForm();
    setError(null);
    setIsFormOpen(false);
  }

  function addItemField() {
    setForm((current) => ({
      ...current,
      items: [...current.items, createItemField()],
    }));
  }

  function updateItemField(
    id: string,
    updates: Partial<Pick<OrderItemField, "productId" | "quantity">>
  ) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  }

  function removeItemField(id: string) {
    setForm((current) => {
      const nextItems = current.items.filter((item) => item.id !== id);

      return {
        ...current,
        items: nextItems.length ? nextItems : [createItemField()],
      };
    });
  }

  function validateCreateForm() {
    if (form.fulfillmentType === "DELIVERY" && !form.address.trim()) {
      return "Ingresá la dirección de entrega.";
    }

    const itemsResult = itemFieldsToPayload(form.items);

    if (!itemsResult.ok) {
      return itemsResult.message;
    }

    if (!itemsResult.items.length) {
      return "Agregá al menos un ítem al pedido.";
    }

    return null;
  }

  function validateEditForm(order: CommerceOrder) {
    const version = readVersion(order);

    if (version === null) {
      return "No se pudo leer la versión actual del pedido.";
    }

    const itemsResult = itemFieldsToPayload(form.items);

    if (!itemsResult.ok) {
      return itemsResult.message;
    }

    if (form.status === order.status && !itemsResult.items.length) {
      return "Cambiá el estado o agregá un ítem para actualizar.";
    }

    return null;
  }

  async function submitCreateOrder() {
    const itemsResult = itemFieldsToPayload(form.items);

    if (!itemsResult.ok) {
      throw new Error(itemsResult.message);
    }

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fulfillmentType: form.fulfillmentType,
        address:
          form.fulfillmentType === "DELIVERY"
            ? form.address.trim()
            : undefined,
        notes: form.notes.trim() || undefined,
        currency: form.currency.trim().toUpperCase() || "PYG",
        items: itemsResult.items,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(messageFromPayload(payload, "No se pudo crear el pedido."));
    }
  }

  async function submitUpdateOrder(order: CommerceOrder) {
    const orderId = encodeURIComponent(String(order.id));
    const itemsResult = itemFieldsToPayload(form.items);

    if (!itemsResult.ok) {
      throw new Error(itemsResult.message);
    }

    let latestOrder = order;
    let expectedVersion = readVersion(latestOrder);

    if (expectedVersion === null) {
      throw new Error("No se pudo leer la versión actual del pedido.");
    }

    if (itemsResult.items.length) {
      const response = await fetch(`/api/orders/${orderId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          expectedVersion,
          items: itemsResult.items,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            payload,
            "No se pudieron actualizar los ítems del pedido."
          )
        );
      }

      if (isOrder(payload)) {
        latestOrder = payload;
        expectedVersion = readVersion(latestOrder) ?? expectedVersion + 1;
      } else {
        expectedVersion += 1;
      }
    }

    if (form.status !== latestOrder.status) {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toStatus: form.status,
          expectedVersion,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar el pedido.")
        );
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = editingOrder
      ? validateEditForm(editingOrder)
      : validateCreateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingOrder) {
        await submitUpdateOrder(editingOrder);
      } else {
        await submitCreateOrder();
      }

      resetForm();
      setIsFormOpen(false);
      setSuccess(
        editingOrder
          ? "Orden actualizada correctamente."
          : "Orden creada correctamente."
      );
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la orden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    await loadOrders(filters);
  }

  async function handleDelete(order: CommerceOrder) {
    const confirmed = window.confirm(
      `¿Eliminar la orden ${orderCode(order)}?`
    );

    if (!confirmed) return;

    setPendingOrderId(String(order.id));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(String(order.id))}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          messageFromPayload(payload, "No se pudo eliminar el pedido.")
        );
      }

      if (editingOrder?.id === order.id) {
        resetForm();
        setIsFormOpen(false);
      }

      setSuccess("Orden eliminada correctamente.");
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar el pedido."
      );
    } finally {
      setPendingOrderId(null);
    }
  }

  return (
    <div className="catalog-layout">
      <section className="card card-lg catalog-table-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Tabla de órdenes</h2>
            <p className="muted">
              {visibleOrders.length} órdenes · {openCount} abiertas
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              className="button-tonal"
              onClick={openCreateForm}
              type="button"
            >
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

        {!isFormOpen && error ? (
          <div className="error-box catalog-status-message" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {!isFormOpen && success ? (
          <div className="success-box catalog-status-message" role="status">
            <CircleCheck aria-hidden="true" size={18} />
            <span>{success}</span>
          </div>
        ) : null}

        <form
          className="catalog-filters orders-filters"
          onSubmit={handleFilterSubmit}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="orders-search">
              Buscar
            </label>
            <input
              className="field-control"
              id="orders-search"
              placeholder="Orden, cliente o producto"
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="orders-filter-status">
              Estado
            </label>
            <select
              className="field-control"
              id="orders-filter-status"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as StatusFilter,
                }))
              }
            >
              <option value="ALL">Todos</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <button className="button-tonal" disabled={isLoading} type="submit">
            <Search size={17} />
            Filtrar
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table orders-data-table">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Ítems</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={8}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : visibleOrders.length ? (
                visibleOrders.map((order) => {
                  const isPending = pendingOrderId === String(order.id);
                  const status = order.status ?? "PLACED";
                  const config = statusConfig[status];
                  const items = order.items ?? [];

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>{orderCode(order)}</strong>
                        <span className="table-muted">
                          {formatDate(order.createdAt)}
                        </span>
                      </td>
                      <td>
                        <strong>{customerName(order)}</strong>
                        <span className="table-muted">
                          {customerDetail(order)}
                        </span>
                      </td>
                      <td>
                        <span className="pill">
                          {fulfillmentLabel(order.fulfillmentType)}
                        </span>
                        {order.address ? (
                          <span className="table-muted">{order.address}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`pill ${config.pillClass}`}>
                          {config.label}
                        </span>
                      </td>
                      <td>{formatPrice(order.total, order.currency ?? "PYG")}</td>
                      <td>
                        {items.length ? (
                          <div className="order-items-viewer">
                            {items.slice(0, 2).map((item) => (
                              <span
                                className="order-item-chip"
                                key={`${order.id}-${item.productId}`}
                              >
                                <strong>{item.name ?? item.productId}</strong>
                                <span>x{item.quantity}</span>
                              </span>
                            ))}
                            {items.length > 2 ? (
                              <span className="order-item-chip muted-chip">
                                +{items.length - 2}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="table-muted">Sin ítems</span>
                        )}
                      </td>
                      <td>{formatDate(order.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            disabled={isPending}
                            onClick={() => openEditFormFromRow(order)}
                            title="Actualizar"
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
                  <td colSpan={8}>
                    <div className="empty-table-state">
                      <ReceiptText aria-hidden="true" size={26} />
                      <strong>Sin órdenes registradas</strong>
                      <span>Creá una orden o ajustá los filtros.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar formulario"
            className="catalog-modal-backdrop"
            disabled={isSubmitting}
            onClick={closeFormModal}
            type="button"
          />
          <section
            aria-label={editingOrder ? "Actualizar orden" : "Nueva orden"}
            aria-modal="true"
            className="card card-lg catalog-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {editingOrder
                    ? `Actualizar ${orderCode(editingOrder)}`
                    : "Nueva orden"}
                </h2>
                <p className="muted">
                  {editingOrder
                    ? "Estado e ítems operativos del pedido."
                    : "Pedido asociado al comercio actual."}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isSubmitting}
                onClick={closeFormModal}
                title="Cerrar formulario"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleSubmit}>
              {editingOrder ? (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="order-status">
                      Estado
                    </label>
                    <select
                      className="field-control"
                      disabled={isSubmitting}
                      id="order-status"
                      value={form.status}
                      onChange={(event) =>
                        updateForm("status", event.target.value as OrderStatus)
                      }
                    >
                      {statusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <span className="field-label">Ítems actuales</span>
                    {editingOrder.items?.length ? (
                      <div className="order-current-items">
                        {editingOrder.items.map((item) => (
                          <div
                            className="order-current-item"
                            key={`${editingOrder.id}-${item.productId}`}
                          >
                            <span>
                              <strong>{itemDisplayName(item)}</strong>
                              <span>
                                {item.sku ? `${item.sku} · ` : ""}
                                {formatPrice(
                                  item.unitPrice ?? 0,
                                  editingOrder.currency ?? "PYG"
                                )}
                              </span>
                            </span>
                            <strong>x{item.quantity}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="metadata-empty-state">
                        Sin productos en esta orden.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-grid">
                    <div className="field-group">
                      <label className="field-label" htmlFor="order-type">
                        Tipo
                      </label>
                      <select
                        className="field-control"
                        disabled={isSubmitting}
                        id="order-type"
                        value={form.fulfillmentType}
                        onChange={(event) =>
                          updateForm(
                            "fulfillmentType",
                            event.target.value as FulfillmentType
                          )
                        }
                      >
                        <option value="DELIVERY">Delivery</option>
                        <option value="PICKUP">Retiro</option>
                      </select>
                    </div>

                    <div className="field-group">
                      <label className="field-label" htmlFor="order-currency">
                        Moneda
                      </label>
                      <input
                        className="field-control"
                        disabled
                        id="order-currency"
                        maxLength={3}
                        value={form.currency}
                        onChange={(event) =>
                          updateForm(
                            "currency",
                            event.target.value.toUpperCase()
                          )
                        }
                      />
                    </div>
                  </div>

                  {form.fulfillmentType === "DELIVERY" ? (
                    <div className="field-group">
                      <label className="field-label" htmlFor="order-address">
                        Dirección
                      </label>
                      <input
                        className="field-control"
                        disabled={isSubmitting}
                        id="order-address"
                        placeholder="Av. principal 123"
                        value={form.address}
                        onChange={(event) =>
                          updateForm("address", event.target.value)
                        }
                      />
                    </div>
                  ) : null}

                  <div className="field-group">
                    <label className="field-label" htmlFor="order-notes">
                      Notas
                    </label>
                    <textarea
                      className="field-control textarea-control"
                      disabled={isSubmitting}
                      id="order-notes"
                      placeholder="Indicaciones del pedido"
                      rows={3}
                      value={form.notes}
                      onChange={(event) =>
                        updateForm("notes", event.target.value)
                      }
                    />
                  </div>
                </>
              )}

              <div className="field-group">
                <div className="field-label-row">
                  <span className="field-label">
                    {editingOrder ? "Agregar ítems" : "Ítems"}
                  </span>
                  <button
                    className="suggestion-chip custom-chip"
                    disabled={isSubmitting}
                    onClick={addItemField}
                    type="button"
                  >
                    <Plus size={14} />
                    Ítem
                  </button>
                </div>

                <div className="order-item-field-list">
                  {form.items.map((item) => (
                    <div className="order-item-field-row" key={item.id}>
                      {products.length ? (
                        <select
                          aria-label="Producto"
                          className="field-control order-item-product-control"
                          disabled={isSubmitting}
                          value={item.productId}
                          onChange={(event) =>
                            updateItemField(item.id, {
                              productId: event.target.value,
                            })
                          }
                        >
                          <option value="">Seleccionar producto</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {productOptionLabel(product)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label="ID de producto"
                          className="field-control order-item-product-control"
                          disabled={isSubmitting}
                          inputMode="numeric"
                          placeholder="ID de producto"
                          value={item.productId}
                          onChange={(event) =>
                            updateItemField(item.id, {
                              productId: event.target.value,
                            })
                          }
                        />
                      )}

                      <input
                        aria-label="Cantidad"
                        className="field-control order-item-quantity-control"
                        disabled={isSubmitting}
                        inputMode="numeric"
                        min="1"
                        placeholder="Cantidad"
                        type="number"
                        value={item.quantity}
                        onChange={(event) =>
                          updateItemField(item.id, {
                            quantity: event.target.value,
                          })
                        }
                      />

                      <button
                        aria-label="Eliminar ítem"
                        className="icon-button danger-button order-item-remove"
                        disabled={isSubmitting}
                        onClick={() => removeItemField(item.id)}
                        type="button"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  className="button-primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="spinner" />
                      Guardando
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      {editingOrder ? "Actualizar" : "Guardar"}
                    </>
                  )}
                </button>
                <button
                  className="button-secondary"
                  disabled={isSubmitting}
                  onClick={closeFormModal}
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
