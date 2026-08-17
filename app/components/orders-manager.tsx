"use client";

import {
  ArrowLeftRight,
  CircleAlert,
  CircleCheck,
  Edit3,
  MapPin,
  Pin,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Store,
  Truck,
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
import {
  AdminDataScopeNotice,
  useAdminScope,
} from "@/app/components/admin-scope-context";
import { confirmDialogClose } from "@/app/lib/confirm-dialog-close";
import {
  orderBelongsToMerchant,
  orderMerchantId,
} from "@/app/lib/orders/order-merchant";
import { googleMapsUrlForAddress } from "@/app/lib/orders/order-address";
import {
  orderContainsService,
  orderFulfillmentCompatibility,
  orderFulfillmentLabel,
  orderFulfillmentValidationMessage,
  serviceProductIdSet,
} from "@/app/lib/orders/order-fulfillment";
import {
  assignmentBlockedReason,
  availableOrderStatuses,
  canAssignCourierToOrder,
  nextOrderStatuses,
  orderStatusLabel,
} from "@/app/lib/order-status";

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
  phone?: string | null;
  contactEmail?: string | null;
};

type CourierReference = {
  id?: number | string;
  name?: string | null;
  user?: EntityReference | null;
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
  merchantId?: number | string;
  merchant?: EntityReference;
  customer?: EntityReference;
  courier?: CourierReference | null;
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
  type?: "PRODUCT" | "SERVICE";
  sku?: string;
  name: string;
  price: number | string;
  currency: string;
  available: boolean;
  metadata?: Record<string, unknown> | null;
};

type Courier = {
  id: number | string;
  name?: string | null;
  user?: EntityReference | null;
  isActive: boolean;
  metadata?: Record<string, unknown> | null;
};

type ListOrdersResponse = {
  data?: CommerceOrder[];
};

type ListProductsResponse = {
  data?: CatalogProduct[];
};

type ListCouriersResponse = {
  data?: Courier[];
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

type LoadOrdersOptions = {
  background?: boolean;
  merge?: boolean;
};

const initialFilters: OrderFilters = {
  q: "",
  status: "ALL",
};

const MAX_LOADED_ORDERS = 100;

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: "PLACED", label: orderStatusLabel("PLACED") },
  { value: "CONFIRMED", label: orderStatusLabel("CONFIRMED") },
  { value: "ASSIGNED", label: orderStatusLabel("ASSIGNED") },
  { value: "PICKED_UP", label: orderStatusLabel("PICKED_UP") },
  { value: "DELIVERED", label: orderStatusLabel("DELIVERED") },
  { value: "CANCELED", label: orderStatusLabel("CANCELED") },
];

const statusConfig: Record<
  OrderStatus,
  { label: string; pillClass: string }
> = {
  PLACED: { label: orderStatusLabel("PLACED"), pillClass: "pending" },
  CONFIRMED: {
    label: orderStatusLabel("CONFIRMED"),
    pillClass: "confirmed",
  },
  ASSIGNED: { label: orderStatusLabel("ASSIGNED"), pillClass: "assigned" },
  PICKED_UP: {
    label: orderStatusLabel("PICKED_UP"),
    pillClass: "picked-up",
  },
  DELIVERED: { label: orderStatusLabel("DELIVERED"), pillClass: "success" },
  CANCELED: { label: orderStatusLabel("CANCELED"), pillClass: "error" },
};

const deliveryWorkflowStatuses: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
];

const pickupWorkflowStatuses: OrderStatus[] = [
  "PLACED",
  "CONFIRMED",
  "DELIVERED",
];

type OrderRowAction =
  | {
      kind: "assign";
      label: string;
      title: string;
    }
  | {
      kind: "status";
      label: string;
      title: string;
      toStatus: OrderStatus;
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

function OrderAddress({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const googleMapsUrl = googleMapsUrlForAddress(address);

  if (!googleMapsUrl) {
    return <span className={className}>{address}</span>;
  }

  return (
    <a
      aria-label={`Abrir ${address} en Google Maps`}
      className={[className, "order-address-link"].filter(Boolean).join(" ")}
      href={googleMapsUrl}
      rel="noopener noreferrer"
      target="_blank"
      title="Abrir en Google Maps"
    >
      <span>{address}</span>
      <MapPin aria-hidden="true" size={13} />
    </a>
  );
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

function orderMatchesStatus(order: CommerceOrder, status: StatusFilter) {
  return status === "ALL" || order.status === status;
}

function newerOrder(
  current: CommerceOrder,
  incoming: CommerceOrder
): CommerceOrder {
  const currentVersion = Number(current.version);
  const incomingVersion = Number(incoming.version);

  if (
    Number.isFinite(currentVersion) &&
    Number.isFinite(incomingVersion) &&
    currentVersion !== incomingVersion
  ) {
    return incomingVersion > currentVersion ? incoming : current;
  }

  const currentUpdatedAt = Date.parse(current.updatedAt ?? "");
  const incomingUpdatedAt = Date.parse(incoming.updatedAt ?? "");

  if (
    Number.isFinite(currentUpdatedAt) &&
    Number.isFinite(incomingUpdatedAt) &&
    currentUpdatedAt !== incomingUpdatedAt
  ) {
    return incomingUpdatedAt > currentUpdatedAt ? incoming : current;
  }

  return incoming;
}

function newestOrdersFirst(first: CommerceOrder, second: CommerceOrder) {
  const firstCreatedAt = Date.parse(first.createdAt ?? "");
  const secondCreatedAt = Date.parse(second.createdAt ?? "");

  if (
    Number.isFinite(firstCreatedAt) &&
    Number.isFinite(secondCreatedAt) &&
    firstCreatedAt !== secondCreatedAt
  ) {
    return secondCreatedAt - firstCreatedAt;
  }

  const firstId = Number(first.id);
  const secondId = Number(second.id);

  if (Number.isFinite(firstId) && Number.isFinite(secondId)) {
    return secondId - firstId;
  }

  return 0;
}

function mergeOrders(
  current: CommerceOrder[],
  incoming: CommerceOrder[],
  status: StatusFilter
) {
  const ordersById = new Map(
    current.map((order) => [String(order.id), order] as const)
  );

  incoming.forEach((order) => {
    const orderId = String(order.id);
    const existing = ordersById.get(orderId);
    ordersById.set(orderId, existing ? newerOrder(existing, order) : order);
  });

  return Array.from(ordersById.values())
    .filter((order) => orderMatchesStatus(order, status))
    .sort(newestOrdersFirst)
    .slice(0, MAX_LOADED_ORDERS);
}

type RealtimeOrdersChangedPayload = {
  event?: string;
  orderId?: number | string | null;
};

function readRealtimeOrdersChanged(event: Event) {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }

  try {
    const payload = JSON.parse(event.data) as RealtimeOrdersChangedPayload;
    const orderId = payload.orderId;

    return {
      event: payload.event,
      orderId:
        orderId === null || orderId === undefined ? null : String(orderId),
    };
  } catch {
    return null;
  }
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

function isCourier(value: unknown): value is Courier {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "isActive" in value;
}

function readCouriers(payload: unknown): Courier[] {
  if (Array.isArray(payload)) {
    return payload.filter(isCourier);
  }

  if (payload && typeof payload === "object") {
    const data = (payload as ListCouriersResponse).data;
    if (Array.isArray(data)) {
      return data.filter(isCourier);
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

function customerName(order: CommerceOrder) {
  const customer = order.customer;

  return (
    customer?.name ??
    customer?.nickname ??
    customer?.email ??
    `Cliente #${customer?.id ?? "-"}`
  );
}

function orderMerchantName(order: CommerceOrder) {
  const merchantId = orderMerchantId(order);

  return (
    order.merchant?.name ??
    (merchantId ? `Comercio #${merchantId}` : "Sin comercio")
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
  const type = product.type === "SERVICE" ? "Servicio" : "Producto";
  return `${product.name} · ${type}${sku} · ${formatPrice(
    product.price,
    product.currency
  )}`;
}

function catalogProductsForItems(
  items: Array<{ productId?: number | string | null }>,
  productsById: ReadonlyMap<string, CatalogProduct>
) {
  const selectedProducts: CatalogProduct[] = [];
  const seenProductIds = new Set<string>();

  for (const item of items) {
    if (item.productId === null || item.productId === undefined) continue;

    const productId = String(item.productId);
    if (!productId || seenProductIds.has(productId)) continue;

    const product = productsById.get(productId);
    if (!product) continue;

    seenProductIds.add(productId);
    selectedProducts.push(product);
  }

  return selectedProducts;
}

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function courierDisplayName(courier?: CourierReference | Courier | null) {
  if (!courier) {
    return "Sin repartidor";
  }

  return (
    courier.name ??
    courier.user?.name ??
    courier.user?.nickname ??
    courier.user?.email ??
    `Repartidor #${courier.id ?? "-"}`
  );
}

function courierDetail(courier?: CourierReference | Courier | null) {
  const user = courier?.user;

  if (user?.phone) {
    return user.phone;
  }

  if (user?.email) {
    return user.email;
  }

  return courier?.id ? `ID ${courier.id}` : "Sin referencia";
}

function courierOptionLabel(courier: Courier) {
  const details = [
    courier.user?.email,
    metadataText(courier.metadata, "vehicle"),
    metadataText(courier.metadata, "licensePlate") ||
      metadataText(courier.metadata, "license_plate") ||
      metadataText(courier.metadata, "plate"),
    metadataText(courier.metadata, "area"),
  ].filter(Boolean);

  return `${courierDisplayName(courier)}${
    details.length ? ` · ${details.join(" · ")}` : ""
  }`;
}

function courierVehicle(courier?: Courier | null) {
  return courier ? metadataText(courier.metadata, "vehicle") : "";
}

function courierLicensePlate(courier?: Courier | null) {
  return courier
    ? metadataText(courier.metadata, "licensePlate") ||
        metadataText(courier.metadata, "license_plate") ||
        metadataText(courier.metadata, "plate")
    : "";
}

function courierArea(courier?: Courier | null) {
  return courier ? metadataText(courier.metadata, "area") : "";
}

function statusOptionsForOrder(order: CommerceOrder | null) {
  if (!order) {
    return statusOptions;
  }

  const allowedStatuses = new Set(availableOrderStatuses(order));
  return statusOptions
    .filter((status) => allowedStatuses.has(status.value))
    .map((status) => ({
      ...status,
      label: statusLabelForFulfillment(status.value, order.fulfillmentType),
    }));
}

function canAssignDelivery(order: CommerceOrder) {
  return canAssignCourierToOrder(order);
}

function assignmentActionTitle(order: CommerceOrder) {
  return assignmentBlockedReason(order) ?? "Asignar delivery";
}

function workflowStatusesForOrder(order: CommerceOrder) {
  return order.fulfillmentType === "PICKUP"
    ? pickupWorkflowStatuses
    : deliveryWorkflowStatuses;
}

function statusLabelForFulfillment(
  status: OrderStatus,
  fulfillmentType?: FulfillmentType
) {
  return status === "DELIVERED" && fulfillmentType === "PICKUP"
    ? "Retirado/Atendido"
    : statusConfig[status].label;
}

function primaryStatusActionLabel(
  status: OrderStatus,
  fulfillmentType?: FulfillmentType
) {
  const labels: Partial<Record<OrderStatus, string>> = {
    CONFIRMED: "Confirmar",
    ASSIGNED: "Marcar asignado",
    PICKED_UP: "Marcar en camino",
    DELIVERED: "Marcar entregado",
  };

  if (status === "DELIVERED" && fulfillmentType === "PICKUP") {
    return "Marcar retirado/atendido";
  }

  return labels[status] ?? statusConfig[status].label;
}

function nextPrimaryOrderAction(order: CommerceOrder): OrderRowAction | null {
  if (canAssignCourierToOrder(order)) {
    return {
      kind: "assign",
      label: "Asignar",
      title: "Asignar repartidor",
    };
  }

  const nextStatus = nextOrderStatuses(order).find(
    (status) => status !== "CANCELED"
  );

  if (!nextStatus) {
    return null;
  }

  return {
    kind: "status",
    label: primaryStatusActionLabel(nextStatus, order.fulfillmentType),
    title: `Avanzar a ${statusLabelForFulfillment(
      nextStatus,
      order.fulfillmentType
    )}`,
    toStatus: nextStatus,
  };
}

function OrderWorkflowSequence({
  fulfillmentType,
}: {
  fulfillmentType: FulfillmentType;
}) {
  const statuses =
    fulfillmentType === "PICKUP"
      ? pickupWorkflowStatuses
      : deliveryWorkflowStatuses;

  return (
    <ol className="order-workflow-sequence">
      {statuses.map((status) => (
        <li key={status}>
          {statusLabelForFulfillment(status, fulfillmentType)}
        </li>
      ))}
    </ol>
  );
}


function OrderStatusStepper({ order }: { order: CommerceOrder }) {
  const currentStatus = order.status ?? "PLACED";

  if (currentStatus === "CANCELED") {
    return (
      <div className="order-status-canceled-flow">Flujo cancelado</div>
    );
  }

  const workflowStatuses = workflowStatusesForOrder(order);
  const currentStatusIndex = workflowStatuses.indexOf(currentStatus);

  return (
    <ol
      aria-label={`Progreso de la orden ${orderCode(order)}`}
      className="order-status-stepper"
    >
      {workflowStatuses.map((status, index) => {
        const stepState =
          currentStatusIndex === -1 || index > currentStatusIndex
            ? "next"
            : index === currentStatusIndex
              ? "current"
              : "done";

        return (
          <li
            className={`order-status-step ${stepState}`}
            key={status}
            title={statusLabelForFulfillment(status, order.fulfillmentType)}
          >
            <span className="order-status-step-dot" />
            <span className="order-status-step-label">
              {statusLabelForFulfillment(status, order.fulfillmentType)}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
    orderMerchantId(order),
    order.merchant?.name,
    customerName(order),
    order.customer?.email,
    courierDisplayName(order.courier),
    order.courier?.user?.email,
    order.courier?.user?.phone,
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

function itemCountLabel(count: number) {
  return `${count} ${count === 1 ? "ítem" : "ítems"}`;
}

function itemUnitPriceLabel(item: OrderItem, currency: string) {
  if (
    item.unitPrice === null ||
    item.unitPrice === undefined ||
    item.unitPrice === ""
  ) {
    return "Sin precio";
  }

  return formatPrice(item.unitPrice, currency);
}

function itemLineTotal(item: OrderItem, currency: string) {
  if (
    item.unitPrice === null ||
    item.unitPrice === undefined ||
    item.unitPrice === ""
  ) {
    return null;
  }

  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return null;
  }

  return formatPrice(quantity * unitPrice, currency);
}

export function OrdersManager() {
  const { canManage, isAdmin, scope, scopeKey, scopeLabel } = useAdminScope();
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [form, setForm] = useState<OrderForm>(() => createEmptyForm());
  const [filters, setFilters] = useState<OrderFilters>(initialFilters);
  const [editingOrder, setEditingOrder] = useState<CommerceOrder | null>(null);
  const [viewingItemsOrder, setViewingItemsOrder] =
    useState<CommerceOrder | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<CommerceOrder | null>(
    null
  );
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [isCouriersLoading, setIsCouriersLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [couriersError, setCouriersError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingStatusOrderId, setUpdatingStatusOrderId] = useState<
    string | null
  >(null);
  const [recentlyUpdatedOrderId, setRecentlyUpdatedOrderId] = useState<
    string | null
  >(null);
  const [ordersPagination, setOrdersPagination] =
    useState<TablePaginationState>({
      page: 1,
      pageSize: DEFAULT_TABLE_PAGE_SIZE,
    });
  const rowFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const ordersLoadRequestRef = useRef(0);
  const ordersMutationRevisionRef = useRef(0);
  const filtersRef = useRef(filters);
  const loadOrdersRef = useRef<
    (
      nextFilters?: OrderFilters,
      options?: LoadOrdersOptions
    ) => Promise<void>
  >(async () => {});
  const hasOpenModal =
    isFormOpen || viewingItemsOrder !== null || assigningOrder !== null;

  const visibleOrders = useMemo(
    () => orders.filter((order) => orderMatchesQuery(order, filters.q)),
    [filters.q, orders]
  );
  const ordersPage = useMemo(
    () => paginateRows(visibleOrders, ordersPagination),
    [ordersPagination, visibleOrders]
  );

  const openCount = useMemo(
    () =>
      orders.filter((order) => {
        return order.status !== "DELIVERED" && order.status !== "CANCELED";
      }).length,
    [orders]
  );

  const activeCouriers = useMemo(
    () =>
      couriers
        .filter((courier) => courier.isActive)
        .sort((first, second) =>
          courierDisplayName(first).localeCompare(courierDisplayName(second))
        ),
    [couriers]
  );

  const selectedCourier = useMemo(
    () =>
      activeCouriers.find(
        (courier) => String(courier.id) === selectedCourierId
      ) ?? null,
    [activeCouriers, selectedCourierId]
  );
  const availableProducts = useMemo(
    () => products.filter((product) => product.available),
    [products]
  );
  const productsById = useMemo(
    () =>
      new Map(products.map((product) => [String(product.id), product] as const)),
    [products]
  );
  const serviceProductIds = useMemo(
    () => serviceProductIdSet(products),
    [products]
  );
  const formProducts = useMemo(
    () =>
      catalogProductsForItems(
        [...(editingOrder?.items ?? []), ...form.items],
        productsById
      ),
    [editingOrder, form.items, productsById]
  );
  const formFulfillmentCompatibility = useMemo(
    () => orderFulfillmentCompatibility(formProducts),
    [formProducts]
  );
  const formContainsService = useMemo(
    () =>
      formFulfillmentCompatibility.containsService ||
      orderContainsService(editingOrder?.items, serviceProductIds),
    [editingOrder, formFulfillmentCompatibility, serviceProductIds]
  );
  const assignmentBlocker = assigningOrder
    ? assignmentBlockedReason(assigningOrder)
    : null;
  const canSubmitAssignment = Boolean(
    assigningOrder &&
      !assignmentBlocker &&
      selectedCourier &&
      activeCouriers.length
  );

  async function loadProducts() {
    try {
      const response = await fetch("/api/products?limit=100", {
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

  async function loadCouriers() {
    setIsCouriersLoading(true);

    try {
      const response = await fetch("/api/couriers?limit=100", {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            payload,
            "No se pudo cargar la lista de repartidores."
          )
        );
      }

      setCouriers(readCouriers(payload));
      setCouriersError(null);
    } catch (err) {
      setCouriers([]);
      setCouriersError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la lista de repartidores."
      );
    } finally {
      setIsCouriersLoading(false);
    }
  }

  async function loadOrders(
    nextFilters = filters,
    { background = false, merge = false }: LoadOrdersOptions = {}
  ) {
    const requestId = ++ordersLoadRequestRef.current;
    const mutationRevision = ordersMutationRevisionRef.current;

    if (!background) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(buildOrdersUrl(nextFilters), {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo cargar la lista de pedidos.")
        );
      }

      const nextOrders = readOrders(payload);
      if (requestId !== ordersLoadRequestRef.current) return;

      setOrders((current) => {
        const shouldMerge =
          merge || mutationRevision !== ordersMutationRevisionRef.current;
        return shouldMerge
          ? mergeOrders(current, nextOrders, nextFilters.status)
          : nextOrders;
      });

      if (!merge && mutationRevision === ordersMutationRevisionRef.current) {
        const nextVisibleOrders = nextOrders.filter((order) =>
          orderMatchesQuery(order, nextFilters.q)
        );

        setOrdersPagination((current) => {
          const nextPage = paginateRows(nextVisibleOrders, current).currentPage;

          return current.page === nextPage
            ? current
            : { ...current, page: nextPage };
        });
      }
    } catch (err) {
      if (!background && requestId === ordersLoadRequestRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la lista de pedidos."
        );
      }
    } finally {
      if (!background && requestId === ordersLoadRequestRef.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    filtersRef.current = filters;
    loadOrdersRef.current = loadOrders;
  });

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      const requestId = ++ordersLoadRequestRef.current;
      const mutationRevision = ordersMutationRevisionRef.current;
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

        if (!ignore && requestId === ordersLoadRequestRef.current) {
          const nextOrders = readOrders(ordersPayload);

          setOrders((current) =>
            mutationRevision === ordersMutationRevisionRef.current
              ? nextOrders
              : mergeOrders(current, nextOrders, initialFilters.status)
          );
          setOrdersPagination((current) => {
            const nextPage = paginateRows(nextOrders, current).currentPage;

            return current.page === nextPage
              ? current
              : { ...current, page: nextPage };
          });
          setIsLoading(false);
          void Promise.all([loadProducts(), loadCouriers()]);
        }
      } catch (err) {
        if (!ignore && requestId === ordersLoadRequestRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la lista de pedidos."
          );
        }
      } finally {
        if (!ignore && requestId === ordersLoadRequestRef.current) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      ignore = true;
    };
  }, [scopeKey]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", hasOpenModal);

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [hasOpenModal]);

  useEffect(() => {
    const events = new EventSource("/api/orders/events");
    const pendingRealtimeOrderIds = new Map<
      string,
      { wasCreated: boolean; wasDeleted: boolean }
    >();
    let isClosed = false;
    let needsFullRealtimeRefresh = false;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const refreshFromRealtime = (event: Event) => {
      const change = readRealtimeOrdersChanged(event);

      if (change?.orderId) {
        const previous = pendingRealtimeOrderIds.get(change.orderId);
        const wasCreated =
          change.event === "order.created" ||
          previous?.wasCreated === true;
        const wasDeleted =
          change.event === "order.deleted" || previous?.wasDeleted === true;
        pendingRealtimeOrderIds.set(change.orderId, {
          wasCreated,
          wasDeleted,
        });
      } else {
        needsFullRealtimeRefresh = true;
      }

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        const pendingOrders = Array.from(pendingRealtimeOrderIds.entries());
        const deletedOrderIds = new Set(
          pendingOrders.flatMap(([orderId, change]) =>
            change.wasDeleted ? [orderId] : []
          )
        );
        const refreshableOrders = pendingOrders.filter(
          ([, change]) => !change.wasDeleted
        );
        const needsFullRefresh = needsFullRealtimeRefresh;

        pendingRealtimeOrderIds.clear();
        needsFullRealtimeRefresh = false;

        void (async () => {
          const results = await Promise.allSettled(
            refreshableOrders.map(async ([orderId, change]) => {
              const response = await fetch(
                `/api/orders/${encodeURIComponent(orderId)}`,
                {
                  cache: "no-store",
                  credentials: "include",
                }
              );
              const payload = await response.json().catch(() => null);

              if (!response.ok || !isOrder(payload)) {
                throw new Error("No se pudo actualizar el pedido en tiempo real.");
              }

              return { order: payload, wasCreated: change.wasCreated };
            })
          );
          const refreshedOrders = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : []
          );

          if (isClosed) return;

          if (deletedOrderIds.size) {
            ordersMutationRevisionRef.current += 1;
            setOrders((current) =>
              current.filter(
                (order) => !deletedOrderIds.has(String(order.id))
              )
            );
            setEditingOrder((current) =>
              current && deletedOrderIds.has(String(current.id))
                ? null
                : current
            );
            setViewingItemsOrder((current) =>
              current && deletedOrderIds.has(String(current.id))
                ? null
                : current
            );
            setAssigningOrder((current) =>
              current && deletedOrderIds.has(String(current.id))
                ? null
                : current
            );
          }

          if (refreshedOrders.length) {
            const orders = refreshedOrders
              .map(({ order }) => order)
              .filter(
                (order) =>
                  scope.mode === "global" ||
                  orderBelongsToMerchant(order, scope.merchantId)
              );
            const ordersById = new Map(
              orders.map((order) => [String(order.id), order] as const)
            );

            ordersMutationRevisionRef.current += 1;
            setOrders((current) =>
              mergeOrders(current, orders, filtersRef.current.status)
            );
            setEditingOrder((current) => {
              if (!current) return current;
              return ordersById.get(String(current.id)) ?? current;
            });
            setViewingItemsOrder((current) => {
              if (!current) return current;
              return ordersById.get(String(current.id)) ?? current;
            });
            setAssigningOrder((current) => {
              if (!current) return current;
              return ordersById.get(String(current.id)) ?? current;
            });

            if (refreshedOrders.some(({ wasCreated }) => wasCreated)) {
              setOrdersPagination((current) =>
                current.page === 1 ? current : { ...current, page: 1 }
              );
            }
          }

          if (
            needsFullRefresh ||
            results.some((result) => result.status === "rejected")
          ) {
            await loadOrdersRef.current(filtersRef.current, {
              background: true,
              merge: false,
            });
          }
        })();
      }, 250);
    };

    events.addEventListener("orders.changed", refreshFromRealtime);

    return () => {
      isClosed = true;
      events.removeEventListener("orders.changed", refreshFromRealtime);
      events.close();

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }

      pendingRealtimeOrderIds.clear();
      needsFullRealtimeRefresh = false;
    };
  }, [scope.mode, scope.merchantId, scopeKey]);

  useEffect(() => {
    return () => {
      if (rowFeedbackTimeoutRef.current) {
        clearTimeout(rowFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function resetOrdersPage() {
    setOrdersPagination((current) =>
      current.page === 1 ? current : { ...current, page: 1 }
    );
  }

  function markOrderAsRecentlyUpdated(orderId: string) {
    if (rowFeedbackTimeoutRef.current) {
      clearTimeout(rowFeedbackTimeoutRef.current);
    }

    setRecentlyUpdatedOrderId(orderId);
    rowFeedbackTimeoutRef.current = setTimeout(() => {
      setRecentlyUpdatedOrderId((current) =>
        current === orderId ? null : current
      );
      rowFeedbackTimeoutRef.current = null;
    }, 1800);
  }

  function updateOrderInTable(updatedOrder: CommerceOrder) {
    ordersMutationRevisionRef.current += 1;
    setOrders((current) =>
      mergeOrders(current, [updatedOrder], filtersRef.current.status)
    );

    setEditingOrder((current) =>
      current && String(current.id) === String(updatedOrder.id)
        ? updatedOrder
        : current
    );

    setViewingItemsOrder((current) =>
      current && String(current.id) === String(updatedOrder.id)
        ? updatedOrder
        : current
    );

    setAssigningOrder((current) =>
      current && String(current.id) === String(updatedOrder.id)
        ? updatedOrder
        : current
    );
  }

  function updateFilters(updates: Partial<OrderFilters>) {
    resetOrdersPage();
    setFilters((current) => ({ ...current, ...updates }));
  }

  function updateForm<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingOrder(null);
    setForm(createEmptyForm());
  }

  function openCreateForm() {
    resetForm();
    setIsFormLoading(false);
    setError(null);
    setSuccess(null);
    setViewingItemsOrder(null);
    setAssigningOrder(null);
    setIsFormOpen(true);
  }

  async function openEditForm(order: CommerceOrder) {
    setPendingOrderId(String(order.id));
    setEditingOrder(order);
    setForm(orderToForm(order));
    setViewingItemsOrder(null);
    setAssigningOrder(null);
    setIsFormLoading(true);
    setIsFormOpen(true);
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
    } catch (err) {
      setIsFormOpen(false);
      resetForm();
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el detalle del pedido."
      );
    } finally {
      setIsFormLoading(false);
      setPendingOrderId(null);
    }
  }

  function openEditFormFromRow(order: CommerceOrder) {
    void openEditForm(order);
  }

  function closeFormModal() {
    if (isSubmitting || isFormLoading) return;
    if (!confirmDialogClose("form")) return;

    resetForm();
    setIsFormLoading(false);
    setError(null);
    setIsFormOpen(false);
  }

  function openItemsModal(order: CommerceOrder) {
    setViewingItemsOrder(order);
    setAssigningOrder(null);
  }

  function closeItemsModal() {
    if (!confirmDialogClose()) return;

    setViewingItemsOrder(null);
  }

  function openAssignModal(order: CommerceOrder) {
    const blockedReason = assignmentBlockedReason(order);

    setAssigningOrder(order);
    setViewingItemsOrder(null);
    setIsFormOpen(false);
    setError(null);
    setSuccess(null);
    setAssignmentError(blockedReason ?? couriersError);
    setSelectedCourierId(
      !blockedReason && activeCouriers.length === 1
        ? String(activeCouriers[0].id)
        : ""
    );

    if (!blockedReason && !couriers.length) {
      void loadCouriers();
    }
  }

  function closeAssignModal() {
    if (isAssigning) return;
    if (!confirmDialogClose("form")) return;

    setAssigningOrder(null);
    setSelectedCourierId("");
    setAssignmentError(null);
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

  function updateItemProduct(id: string, productId: string) {
    const nextItems = form.items.map((item) =>
      item.id === id ? { ...item, productId } : item
    );
    const nextProducts = catalogProductsForItems(
      [...(editingOrder?.items ?? []), ...nextItems],
      productsById
    );
    const compatibility = orderFulfillmentCompatibility(nextProducts);
    const fixedFulfillmentType = editingOrder?.fulfillmentType;

    if (!compatibility.allowedFulfillmentTypes.length) {
      setError(
        "Este ítem no comparte una modalidad con el resto del pedido. Creá un pedido separado."
      );
      return;
    }

    if (
      fixedFulfillmentType &&
      !compatibility.allowedFulfillmentTypes.includes(fixedFulfillmentType)
    ) {
      setError(
        orderFulfillmentValidationMessage(
          nextProducts,
          fixedFulfillmentType
        )
      );
      return;
    }

    const nextFulfillmentType = compatibility.allowedFulfillmentTypes.includes(
      form.fulfillmentType
    )
      ? form.fulfillmentType
      : compatibility.allowedFulfillmentTypes[0];

    setError(null);
    setForm((current) => ({
      ...current,
      fulfillmentType: nextFulfillmentType,
      items: current.items.map((item) =>
        item.id === id ? { ...item, productId } : item
      ),
    }));
  }

  function productIsCompatibleWithForm(
    itemId: string,
    productId: number | string
  ) {
    const nextItems = form.items.map((item) =>
      item.id === itemId ? { ...item, productId: String(productId) } : item
    );
    const nextProducts = catalogProductsForItems(
      [...(editingOrder?.items ?? []), ...nextItems],
      productsById
    );
    const compatibility = orderFulfillmentCompatibility(nextProducts);
    const fixedFulfillmentType = editingOrder?.fulfillmentType;

    return (
      compatibility.allowedFulfillmentTypes.length > 0 &&
      (!fixedFulfillmentType ||
        compatibility.allowedFulfillmentTypes.includes(fixedFulfillmentType))
    );
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

    const fulfillmentError = orderFulfillmentValidationMessage(
      formProducts,
      form.fulfillmentType
    );

    if (fulfillmentError) {
      return fulfillmentError;
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

    if (itemsResult.items.length) {
      const fulfillmentError = orderFulfillmentValidationMessage(
        formProducts,
        order.fulfillmentType ?? "DELIVERY"
      );

      if (fulfillmentError) {
        return fulfillmentError;
      }
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

    return isOrder(payload) ? payload : null;
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

      if (isOrder(payload)) {
        latestOrder = payload;
      }
    }

    return latestOrder;
  }

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assigningOrder) return;

    setAssignmentError(null);
    setSuccess(null);

    const blockedReason = assignmentBlockedReason(assigningOrder);

    if (blockedReason) {
      setAssignmentError(blockedReason);
      return;
    }

    if (!activeCouriers.length) {
      setAssignmentError("No hay repartidores activos para asignar.");
      return;
    }

    const courierId = Number(selectedCourierId);
    const selectedIsActive = activeCouriers.some(
      (courier) => String(courier.id) === selectedCourierId
    );

    if (!Number.isInteger(courierId) || courierId <= 0 || !selectedIsActive) {
      setAssignmentError("Seleccioná un repartidor válido.");
      return;
    }

    const expectedVersion = readVersion(assigningOrder);

    if (expectedVersion === null) {
      setAssignmentError("No se pudo leer la versión actual del pedido.");
      return;
    }

    setIsAssigning(true);
    setPendingOrderId(String(assigningOrder.id));

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(String(assigningOrder.id))}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            courierId,
            expectedVersion,
          }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo asignar el repartidor.")
        );
      }

      const assignedCourierName = selectedCourier
        ? courierDisplayName(selectedCourier)
        : `Repartidor #${courierId}`;

      setAssigningOrder(null);
      setSelectedCourierId("");
      setSuccess(`Delivery asignado a ${assignedCourierName}.`);
      if (isOrder(payload)) {
        updateOrderInTable(payload);
        markOrderAsRecentlyUpdated(String(payload.id));
      } else {
        await loadOrders();
      }
    } catch (err) {
      setAssignmentError(
        err instanceof Error ? err.message : "No se pudo asignar el repartidor."
      );
    } finally {
      setIsAssigning(false);
      setPendingOrderId(null);
    }
  }

  async function handleQuickStatusUpdate(
    order: CommerceOrder,
    toStatus: OrderStatus
  ) {
    const expectedVersion = readVersion(order);

    if (expectedVersion === null) {
      setError("No se pudo leer la versión actual del pedido.");
      return;
    }

    const orderId = String(order.id);

    setUpdatingStatusOrderId(orderId);
    setPendingOrderId(orderId);
    setRecentlyUpdatedOrderId(null);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            toStatus,
            expectedVersion,
          }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar el estado.")
        );
      }

      const updatedOrder = isOrder(payload)
        ? payload
        : {
            ...order,
            status: toStatus,
            version: expectedVersion + 1,
          };

      updateOrderInTable(updatedOrder);
      markOrderAsRecentlyUpdated(String(updatedOrder.id));
      setSuccess(
        `${orderCode(updatedOrder)} avanzó a ${statusLabelForFulfillment(
          toStatus,
          updatedOrder.fulfillmentType ?? order.fulfillmentType
        )}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo actualizar el estado."
      );
    } finally {
      setUpdatingStatusOrderId(null);
      setPendingOrderId(null);
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
      const savedOrder = editingOrder
        ? await submitUpdateOrder(editingOrder)
        : await submitCreateOrder();

      resetForm();
      setIsFormOpen(false);
      setSuccess(
        editingOrder
          ? "Orden actualizada correctamente."
          : "Orden creada correctamente."
      );
      if (savedOrder) {
        updateOrderInTable(savedOrder);
        markOrderAsRecentlyUpdated(String(savedOrder.id));
      } else {
        await loadOrders(filters, { merge: true });
      }
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
      `¿Eliminar la orden ${orderCode(order)} de ${orderMerchantName(order)}?`
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

      if (viewingItemsOrder?.id === order.id) {
        setViewingItemsOrder(null);
      }

      if (assigningOrder?.id === order.id) {
        setAssigningOrder(null);
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
              disabled={!canManage}
              onClick={openCreateForm}
              title={
                canManage
                  ? "Agregar orden"
                  : "Seleccioná un comercio para agregar órdenes"
              }
              type="button"
            >
              <Plus size={17} />
              Agregar
            </button>
            <button
              className="icon-button"
              disabled={isLoading}
              onClick={() => {
                void loadOrders();
                void loadCouriers();
              }}
              title="Actualizar tabla"
              type="button"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <AdminDataScopeNotice />

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
              onChange={(event) => updateFilters({ q: event.target.value })}
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
                updateFilters({
                  status: event.target.value as StatusFilter,
                })
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

        <div className="orders-table-guide" aria-label="Comportamiento de la tabla">
          <span className="orders-table-scroll-guide">
            <ArrowLeftRight aria-hidden="true" size={16} />
            Deslizá para ver el resto de las columnas
          </span>
          <span className="orders-table-fixed-guide">
            <Pin aria-hidden="true" size={14} />
            Acciones fijas
          </span>
        </div>

        <div className="table-wrap orders-table-wrap">
          <table className="data-table orders-data-table">
            <thead>
              <tr>
                <th>Orden</th>
                {isAdmin ? <th>Comercio</th> : null}
                <th>Cliente</th>
                <th>Descripción</th>
                <th>Dirección</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Repartidor</th>
                <th>Total</th>
                <th>Ítems</th>
                <th>Actualizado</th>
                <th className="orders-actions-column">
                  <span className="orders-actions-heading">
                    <Pin aria-hidden="true" size={13} />
                    Acciones
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={isAdmin ? 12 : 11}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : visibleOrders.length ? (
                ordersPage.rows.map((order) => {
                  const isPending = pendingOrderId === String(order.id);
                  const isUpdatingStatus =
                    updatingStatusOrderId === String(order.id);
                  const isRecentlyUpdated =
                    recentlyUpdatedOrderId === String(order.id);
                  const status = order.status ?? "PLACED";
                  const config = statusConfig[status];
                  const statusLabel = statusLabelForFulfillment(
                    status,
                    order.fulfillmentType
                  );
                  const items = order.items ?? [];
                  const containsService = orderContainsService(
                    items,
                    serviceProductIds
                  );
                  const canAssign = canAssignDelivery(order);
                  const assignmentReason = assignmentBlockedReason(order);
                  const nextAction = nextPrimaryOrderAction(order);
                  const rowStateClass = [
                    isUpdatingStatus ? "order-row-updating" : "",
                    isRecentlyUpdated ? "order-row-updated" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr className={rowStateClass} key={order.id}>
                      <td>
                        <strong>{orderCode(order)}</strong>
                        <span className="table-muted">
                          {formatDate(order.createdAt)}
                        </span>
                      </td>
                      {isAdmin ? (
                        <td>
                          <strong>{orderMerchantName(order)}</strong>
                          <span className="table-muted">
                            ID {order.merchant?.id ?? order.merchantId ?? "-"}
                          </span>
                        </td>
                      ) : null}
                      <td>
                        <strong>{customerName(order)}</strong>
                        <span className="table-muted">
                          {customerDetail(order)}
                        </span>
                      </td>
                      <td>
                        {order.notes ? (
                          <span className="table-muted order-description-cell">
                            {order.notes}
                          </span>
                        ) : (
                          <span className="table-muted">Sin descripción</span>
                        )}
                      </td>
                      <td>
                        {order.address ? (
                          <OrderAddress
                            address={order.address}
                            className="table-muted order-address-cell"
                          />
                        ) : (
                          <span className="table-muted">
                            {order.fulfillmentType === "PICKUP"
                              ? "Retiro/asistencia al local"
                              : "Sin dirección"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="order-fulfillment-cell">
                          <span
                            className={`pill order-fulfillment-pill ${
                              order.fulfillmentType === "PICKUP"
                                ? "pickup"
                                : "delivery"
                            }`}
                          >
                            {orderFulfillmentLabel(
                              order.fulfillmentType,
                              containsService
                            )}
                          </span>
                          <span className="table-muted">
                            {order.fulfillmentType === "PICKUP"
                              ? "Cliente retira/asiste al local"
                              : "Entrega con repartidor"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="order-status-cell">
                          <div className="order-status-head">
                            <span className={`pill ${config.pillClass}`}>
                              {statusLabel}
                            </span>
                            {isUpdatingStatus ? (
                              <span
                                aria-live="polite"
                                className="order-status-feedback"
                              >
                                <span aria-hidden="true" className="spinner" />
                                Actualizando
                              </span>
                            ) : null}
                            {isRecentlyUpdated ? (
                              <span
                                aria-live="polite"
                                className="order-status-feedback success"
                              >
                                Actualizado
                              </span>
                            ) : null}
                          </div>
                          <OrderStatusStepper order={order} />
                        </div>
                      </td>
                      <td>
                        {order.courier?.id ? (
                          <>
                            <strong>{courierDisplayName(order.courier)}</strong>
                            <span className="table-muted">
                              {courierDetail(order.courier)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="table-muted">
                              {order.fulfillmentType === "PICKUP"
                                ? "No aplica"
                                : "Sin asignar"}
                            </span>
                            {canAssign ? (
                              <span className="delivery-ready-chip">
                                Listo para asignar
                              </span>
                            ) : assignmentReason &&
                              order.fulfillmentType !== "PICKUP" ? (
                              <span
                                className="table-muted assignment-lock-reason"
                                title={assignmentReason}
                              >
                                {assignmentReason}
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>{formatPrice(order.total, order.currency ?? "PYG")}</td>
                      <td>
                        {items.length ? (
                          <button
                            aria-label={`Ver ${itemCountLabel(
                              items.length
                            )} de la orden ${orderCode(order)}`}
                            className="order-items-trigger"
                            onClick={() => openItemsModal(order)}
                            type="button"
                          >
                            <ReceiptText aria-hidden="true" size={15} />
                            <span>{itemCountLabel(items.length)}</span>
                          </button>
                        ) : (
                          <span className="table-muted">Sin ítems</span>
                        )}
                      </td>
                      <td>{formatDate(order.updatedAt)}</td>
                      <td className="orders-actions-column">
                        <div className="table-actions order-table-actions">
                          {nextAction ? (
                            <button
                              aria-label={`${nextAction.label} en la orden ${orderCode(
                                order
                              )}`}
                              className={
                                nextAction.kind === "assign"
                                  ? "order-next-action-trigger assign"
                                  : "order-next-action-trigger"
                              }
                              disabled={isPending || !canManage}
                              onClick={() => {
                                if (nextAction.kind === "assign") {
                                  openAssignModal(order);
                                  return;
                                }

                                void handleQuickStatusUpdate(
                                  order,
                                  nextAction.toStatus
                                );
                              }}
                              title={
                                !canManage
                                  ? "Seleccioná un comercio para operar"
                                  : nextAction.kind === "assign"
                                    ? assignmentActionTitle(order)
                                    : nextAction.title
                              }
                              type="button"
                            >
                              {isUpdatingStatus &&
                              nextAction.kind === "status" ? (
                                <span
                                  aria-hidden="true"
                                  className="spinner"
                                />
                              ) : nextAction.kind === "assign" ? (
                                <Truck size={16} />
                              ) : (
                                <CircleCheck size={16} />
                              )}
                              <span>
                                {isUpdatingStatus &&
                                nextAction.kind === "status"
                                  ? "Actualizando"
                                  : nextAction.label}
                              </span>
                            </button>
                          ) : null}
                          <button
                            className="icon-button"
                            disabled={isPending || !canManage}
                            onClick={() => openEditFormFromRow(order)}
                            title={canManage ? "Actualizar" : "Seleccioná un comercio para actualizar"}
                            type="button"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            className="icon-button danger-button"
                            disabled={isPending || !canManage}
                            onClick={() => void handleDelete(order)}
                            title={canManage ? "Eliminar" : "Seleccioná un comercio para eliminar"}
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
                  <td colSpan={isAdmin ? 12 : 11}>
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

        <TablePagination
          currentPage={ordersPage.currentPage}
          itemLabelPlural="órdenes"
          itemLabelSingular="orden"
          pageSize={ordersPage.pageSize}
          totalItems={ordersPage.totalItems}
          totalPages={ordersPage.totalPages}
          onPageChange={(page) =>
            setOrdersPagination((current) => ({ ...current, page }))
          }
          onPageSizeChange={(pageSize) =>
            setOrdersPagination({ page: 1, pageSize })
          }
        />
      </section>

      {isFormOpen ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar formulario"
            className="catalog-modal-backdrop"
            disabled={isSubmitting || isFormLoading}
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
                    ? `Estado e ítems operativos del pedido de ${orderMerchantName(editingOrder)}.`
                    : `Pedido asociado a ${scopeLabel}.`}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isSubmitting || isFormLoading}
                onClick={closeFormModal}
                title="Cerrar formulario"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {isFormLoading ? (
              <div
                aria-live="polite"
                className="modal-loading-state"
                role="status"
              >
                <span aria-hidden="true" className="spinner" />
                <strong>Cargando formulario</strong>
                <span>Obteniendo el detalle actualizado del pedido.</span>
              </div>
            ) : (
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
                      {statusOptionsForOrder(editingOrder).map((status) => (
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
                        Modalidad
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
                        {formFulfillmentCompatibility.allowedFulfillmentTypes.map(
                          (fulfillmentType) => (
                            <option
                              key={fulfillmentType}
                              value={fulfillmentType}
                            >
                              {orderFulfillmentLabel(
                                fulfillmentType,
                                formContainsService
                              )}
                            </option>
                          )
                        )}
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
                      {availableProducts.length ? (
                        <select
                          aria-label="Producto"
                          className="field-control order-item-product-control"
                          disabled={isSubmitting}
                          value={item.productId}
                          onChange={(event) =>
                            updateItemProduct(item.id, event.target.value)
                          }
                        >
                          <option value="">Seleccionar producto</option>
                          {availableProducts.map((product) => {
                            const isCompatible = productIsCompatibleWithForm(
                              item.id,
                              product.id
                            );

                            return (
                              <option
                                disabled={!isCompatible}
                                key={product.id}
                                value={product.id}
                              >
                                {productOptionLabel(product)}
                                {isCompatible ? "" : " · No compatible"}
                              </option>
                            );
                          })}
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
                            updateItemProduct(item.id, event.target.value)
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
                {formFulfillmentCompatibility.isMixed ? (
                  <div className="metadata-empty-state" role="status">
                    Pedido mixto compatible: los productos y servicios comparten
                    {" "}
                    {formFulfillmentCompatibility.allowedFulfillmentTypes
                      .map((fulfillmentType) =>
                        orderFulfillmentLabel(fulfillmentType, true)
                      )
                      .join(" o ")}
                    .
                  </div>
                ) : null}
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
            )}
          </section>
        </div>
      ) : null}

      {assigningOrder ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar asignación de delivery"
            className="catalog-modal-backdrop"
            disabled={isAssigning}
            onClick={closeAssignModal}
            type="button"
          />
          <section
            aria-label={`Asignar delivery a la orden ${orderCode(
              assigningOrder
            )}`}
            aria-modal="true"
            className="card card-lg catalog-modal order-assign-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  Asignar delivery {orderCode(assigningOrder)}
                </h2>
                <p className="muted">
                  {customerName(assigningOrder)} ·{" "}
                  {formatPrice(
                    assigningOrder.total,
                    assigningOrder.currency ?? "PYG"
                  )}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isAssigning}
                onClick={closeAssignModal}
                title="Cerrar asignación"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleAssignSubmit}>
              <div
                className={
                  assignmentBlocker
                    ? "assignment-readiness blocked"
                    : "assignment-readiness ready"
                }
              >
                <span className="assignment-readiness-icon" aria-hidden="true">
                  {assignmentBlocker ? (
                    <CircleAlert size={18} />
                  ) : (
                    <CircleCheck size={18} />
                  )}
                </span>
                <div>
                  <strong>
                    {assignmentBlocker
                      ? "Asignación bloqueada"
                      : "Pedido confirmado para delivery"}
                  </strong>
                  <span>
                    {assignmentBlocker ??
                      "Al asignar, la orden avanza al estado Asignado."}
                  </span>
                </div>
              </div>

              <div className="order-assignment-summary">
                <div>
                  <span>Estado</span>
                  <strong>
                    {statusConfig[assigningOrder.status ?? "PLACED"].label}
                  </strong>
                </div>
                <div>
                  <span>Dirección</span>
                  <strong>
                    {assigningOrder.address ? (
                      <OrderAddress address={assigningOrder.address} />
                    ) : (
                      "Sin dirección"
                    )}
                  </strong>
                </div>
                <div>
                  <span>Ítems</span>
                  <strong>{itemCountLabel(assigningOrder.items?.length ?? 0)}</strong>
                </div>
                <div>
                  <span>Flujo</span>
                  <strong>Confirmado a Asignado</strong>
                </div>
              </div>

              {!assignmentBlocker && isCouriersLoading ? (
                <div
                  aria-live="polite"
                  className="modal-inline-loading"
                  role="status"
                >
                  <span aria-hidden="true" className="spinner" />
                  <span>Cargando repartidores disponibles.</span>
                </div>
              ) : null}

              {!assignmentBlocker ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="order-courier">
                    Repartidor
                  </label>
                  <select
                    className="field-control"
                    disabled={
                      isAssigning || isCouriersLoading || !activeCouriers.length
                    }
                    id="order-courier"
                    value={selectedCourierId}
                    onChange={(event) => {
                      setSelectedCourierId(event.target.value);
                      setAssignmentError(null);
                    }}
                  >
                    <option value="">
                      {isCouriersLoading
                        ? "Cargando repartidores"
                        : activeCouriers.length
                        ? "Seleccionar repartidor"
                        : "Sin repartidores activos"}
                    </option>
                    {activeCouriers.map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {courierOptionLabel(courier)}
                      </option>
                    ))}
                  </select>
                  {selectedCourier ? (
                    <div className="assignment-courier-card">
                      <div>
                        <strong>{courierDisplayName(selectedCourier)}</strong>
                        <span>{courierDetail(selectedCourier)}</span>
                      </div>
                      <div className="assignment-courier-tags">
                        {courierVehicle(selectedCourier) ? (
                          <span>{courierVehicle(selectedCourier)}</span>
                        ) : null}
                        {courierLicensePlate(selectedCourier) ? (
                          <span>{courierLicensePlate(selectedCourier)}</span>
                        ) : null}
                        {courierArea(selectedCourier) ? (
                          <span>{courierArea(selectedCourier)}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!assignmentBlocker && !selectedCourier && !isCouriersLoading ? (
                <div className="metadata-empty-state">
                  Sin repartidor seleccionado.
                </div>
              ) : null}

              {!isCouriersLoading &&
              (assignmentError || (couriersError && !activeCouriers.length)) ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{assignmentError ?? couriersError}</span>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  className="button-primary"
                  disabled={
                    isAssigning || isCouriersLoading || !canSubmitAssignment
                  }
                  type="submit"
                >
                  {isAssigning ? (
                    <>
                      <span aria-hidden="true" className="spinner" />
                      Asignando
                    </>
                  ) : (
                    <>
                      <Truck size={17} />
                      Asignar
                    </>
                  )}
                </button>
                <button
                  className="button-secondary"
                  disabled={isAssigning}
                  onClick={closeAssignModal}
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

      {viewingItemsOrder ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar detalle de ítems"
            className="catalog-modal-backdrop"
            onClick={closeItemsModal}
            type="button"
          />
          <section
            aria-label={`Ítems de la orden ${orderCode(viewingItemsOrder)}`}
            aria-modal="true"
            className="card card-lg catalog-modal order-items-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  Ítems de {orderCode(viewingItemsOrder)}
                </h2>
                <p className="muted">
                  {customerName(viewingItemsOrder)} ·{" "}
                  {formatPrice(
                    viewingItemsOrder.total,
                    viewingItemsOrder.currency ?? "PYG"
                  )}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeItemsModal}
                title="Cerrar detalle"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {viewingItemsOrder.items?.length ? (
              <div className="order-items-modal-list">
                {viewingItemsOrder.items.map((item, index) => {
                  const currency = viewingItemsOrder.currency ?? "PYG";
                  const lineTotal = itemLineTotal(item, currency);

                  return (
                    <article
                      className="order-items-modal-item"
                      key={`${viewingItemsOrder.id}-${item.productId}-${index}`}
                    >
                      <div>
                        <strong>{itemDisplayName(item)}</strong>
                        <span>
                          {item.sku
                            ? `SKU ${item.sku}`
                            : `Producto #${item.productId}`}
                        </span>
                      </div>
                      <div className="order-items-modal-numbers">
                        <span>x{item.quantity}</span>
                        <strong>{itemUnitPriceLabel(item, currency)}</strong>
                        {lineTotal ? <small>{lineTotal}</small> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="metadata-empty-state">
                Sin productos en esta orden.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
