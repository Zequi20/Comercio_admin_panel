"use client";

import {
  Braces,
  CircleAlert,
  CircleCheck,
  Download,
  Edit3,
  FileSpreadsheet,
  Image as ImageIcon,
  Package,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateRows,
  TablePagination,
  type TablePaginationState,
} from "@/app/components/table-pagination";
import {
  AdminDataScopeNotice,
  AdminMerchantTargetField,
  useAdminScope,
} from "@/app/components/admin-scope-context";
import { confirmFormClose } from "@/app/lib/confirm-dialog-close";
import {
  isSupportedImageUrl,
  parseImageUrl,
} from "@/app/lib/image-url";

type ProductType = "PRODUCT" | "SERVICE";
type ProductAvailabilityStatus =
  | "AVAILABLE"
  | "PAUSED"
  | "OUT_OF_STOCK"
  | "INACTIVE";
type AvailabilityFilter = "ALL" | ProductAvailabilityStatus;
type ProductTypeFilter = "ALL" | ProductType;
type MetadataFieldInput = "text" | "url" | "select";

type MetadataField = {
  id: string;
  key: string;
  value: string;
  lockedKey: boolean;
  inputType: MetadataFieldInput;
};

type CatalogProduct = {
  id: number | string;
  merchantId?: number | string;
  catalogNumber?: number | string;
  merchant?: {
    id?: number | string;
    name?: string | null;
  };
  type?: ProductType;
  sku?: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency: string;
  available: boolean;
  availabilityStatus?: ProductAvailabilityStatus;
  metadata?: Record<string, unknown> | null;
};

type ListProductsResponse = {
  data?: CatalogProduct[];
};

type ProductImportError =
  | string
  | {
      row?: number | string;
      sku?: string;
      field?: string;
      message?: string;
      detail?: string;
      error?: string;
      [key: string]: unknown;
    };

type ProductImportResponse = {
  processed: number;
  created: number;
  failed: number;
  errors: ProductImportError[];
};

type CatalogForm = {
  type: ProductType;
  sku: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  currency: string;
  availabilityStatus: ProductAvailabilityStatus;
  metadata: MetadataField[];
};

type CatalogFilters = {
  q: string;
  type: ProductTypeFilter;
  availabilityStatus: AvailabilityFilter;
};

const emptyForm: CatalogForm = {
  type: "PRODUCT",
  sku: "",
  name: "",
  description: "",
  imageUrl: "",
  price: "",
  currency: "PYG",
  availabilityStatus: "AVAILABLE",
  metadata: [],
};

const initialFilters: CatalogFilters = {
  q: "",
  type: "ALL",
  availabilityStatus: "ALL",
};

const availabilityOptions: ReadonlyArray<{
  value: ProductAvailabilityStatus;
  label: string;
  description: string;
}> = [
  {
    value: "AVAILABLE",
    label: "Activo",
    description:
      "Visible en catálogo y detalle; se puede agregar, comprar y confirmar.",
  },
  {
    value: "PAUSED",
    label: "Pausado",
    description:
      "Visible con aviso; no se puede agregar ni confirmar hasta reactivarlo.",
  },
  {
    value: "OUT_OF_STOCK",
    label: "Sin stock",
    description:
      "Visible con aviso; no se puede agregar ni confirmar hasta reponer stock.",
  },
  {
    value: "INACTIVE",
    label: "Inactivo",
    description:
      "Oculto del catálogo cliente; un carrito anterior lo marcará para eliminar.",
  },
];

function availabilityStatusForProduct(
  product: CatalogProduct
): ProductAvailabilityStatus {
  return product.availabilityStatus ??
    (product.available ? "AVAILABLE" : "PAUSED");
}

function productMerchantName(product: CatalogProduct) {
  return (
    product.merchant?.name ??
    (product.merchantId ? `Comercio #${product.merchantId}` : "Sin comercio")
  );
}

function productMerchantKey(product: CatalogProduct) {
  return String(product.merchant?.id ?? product.merchantId ?? "unassigned");
}

function catalogNumberValue(product: CatalogProduct) {
  const value = Number(product.catalogNumber);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function formatCatalogNumber(product: CatalogProduct) {
  const value = catalogNumberValue(product);
  return value === null ? "Sin asignar" : `#${String(value).padStart(3, "0")}`;
}

function availabilityLabel(status: ProductAvailabilityStatus) {
  return (
    availabilityOptions.find((option) => option.value === status)?.label ??
    status
  );
}

const metadataSuggestions = [
  { key: "category", label: "Categoría", inputType: "text" },
  { key: "serviceMode", label: "Modo de servicio", inputType: "select" },
] as const;

const productImageMetadataKey = "imageUrl";

const serviceModeOptions = [
  { value: "", label: "Seleccionar" },
  { value: "DELIVERY", label: "A domicilio" },
  { value: "PICKUP", label: "En local" },
  { value: "DELIVERY_PICKUP", label: "A domicilio y en local" },
];

let metadataFieldCounter = 0;

function nextMetadataFieldId(key = "metadata") {
  metadataFieldCounter += 1;
  return `${key}-${metadataFieldCounter}`;
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

function readImportCount(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isImportError(value: unknown): value is ProductImportError {
  return typeof value === "string" || Boolean(value && typeof value === "object");
}

function readProductImportResponse(payload: unknown): ProductImportResponse {
  if (!payload || typeof payload !== "object") {
    return {
      processed: 0,
      created: 0,
      failed: 0,
      errors: [],
    };
  }

  const record = payload as Record<string, unknown>;
  const errors = Array.isArray(record.errors)
    ? record.errors.filter(isImportError)
    : [];

  return {
    processed: readImportCount(record.processed),
    created: readImportCount(record.created),
    failed: readImportCount(record.failed),
    errors,
  };
}

function firstImportErrorText(error: Exclude<ProductImportError, string>) {
  for (const key of ["message", "detail", "error"]) {
    const value = error[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function formatImportError(error: ProductImportError, index: number) {
  if (typeof error === "string") {
    return error;
  }

  const parts: string[] = [];

  if (error.row !== undefined && error.row !== null && String(error.row)) {
    parts.push(`Fila ${error.row}`);
  }

  if (typeof error.sku === "string" && error.sku.trim()) {
    parts.push(`SKU ${error.sku.trim()}`);
  }

  if (typeof error.field === "string" && error.field.trim()) {
    parts.push(`Campo ${error.field.trim()}`);
  }

  parts.push(firstImportErrorText(error) ?? `Error ${index + 1}`);

  return parts.join(" · ");
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

function isProduct(value: unknown): value is CatalogProduct {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "name" in value && "price" in value;
}

function productToForm(product: CatalogProduct): CatalogForm {
  return {
    type: product.type ?? "PRODUCT",
    sku: product.sku ?? "",
    name: product.name,
    description: product.description ?? "",
    imageUrl: metadataText(product.metadata, productImageMetadataKey),
    price: String(product.price ?? ""),
    currency: product.currency || "PYG",
    availabilityStatus: availabilityStatusForProduct(product),
    metadata: metadataToFields(product.metadata),
  };
}

function normalizePrice(value: string) {
  return Number(value.replace(",", "."));
}

function formatPrice(value: number | string, currency: string) {
  const amount = Number(value);

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

function buildProductsUrl(filters: CatalogFilters) {
  const params = new URLSearchParams({ limit: "100" });

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.type !== "ALL") {
    params.set("type", filters.type);
  }

  if (filters.availabilityStatus !== "ALL") {
    params.set("availabilityStatus", filters.availabilityStatus);
  }

  return `/api/products?${params.toString()}`;
}

function metadataConfigForKey(key: string) {
  return metadataSuggestions.find((suggestion) => suggestion.key === key);
}

function metadataLabelForKey(key: string) {
  return metadataConfigForKey(key)?.label ?? key;
}

function stringifyMetadataValue(value: unknown) {
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

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : "";
}

function metadataEntries(metadata?: Record<string, unknown> | null) {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata).filter(([key, value]) => {
    if (key === productImageMetadataKey) {
      return false;
    }

    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

function metadataImageUrl(metadata?: Record<string, unknown> | null) {
  const parsed = parseImageUrl(
    metadataText(metadata, productImageMetadataKey)
  );

  if (!parsed) {
    return null;
  }

  return isSupportedImageUrl(parsed) ? parsed : null;
}

function metadataCountLabel(count: number) {
  return `${count} ${count === 1 ? "campo" : "campos"}`;
}

function CatalogThumbnail({ product }: { product: CatalogProduct }) {
  const imageUrl = metadataImageUrl(product.metadata);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <span className="catalog-thumbnail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          src={imageUrl}
          onError={() => setFailedImageUrl(imageUrl)}
        />
      </span>
    );
  }

  return (
    <span className="catalog-thumbnail catalog-thumbnail-fallback">
      <Package aria-hidden="true" size={18} />
    </span>
  );
}

function CatalogMetadataModal({
  product,
  onClose,
}: {
  product: CatalogProduct;
  onClose: () => void;
}) {
  const metadata = metadataEntries(product.metadata);

  return (
    <div className="catalog-modal-layer" role="presentation">
      <button
        aria-label="Cerrar detalles técnicos"
        className="catalog-modal-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label={`Detalles técnicos de ${product.name}`}
        aria-modal="true"
        className="card card-lg catalog-modal metadata-modal"
        role="dialog"
      >
        <div className="card-header">
          <div>
            <h2 className="card-title">Detalles técnicos de {product.name}</h2>
            <p className="muted">{metadataCountLabel(metadata.length)}</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title="Cerrar detalles técnicos"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {metadata.length ? (
          <div className="metadata-modal-list">
            {metadata.map(([key, value]) => (
              <article className="metadata-modal-item" key={key}>
                <strong className="metadata-modal-key">
                  {metadataLabelForKey(key)}
                </strong>
                <span className="metadata-modal-value">
                  {stringifyMetadataValue(value) || "-"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="metadata-empty-state">
            Este ítem no tiene detalles técnicos cargados.
          </div>
        )}
      </section>
    </div>
  );
}

function createMetadataField({
  key = "",
  value = "",
  lockedKey = false,
}: {
  key?: string;
  value?: string;
  lockedKey?: boolean;
}): MetadataField {
  const config = metadataConfigForKey(key);

  return {
    id: nextMetadataFieldId(key || "custom"),
    key,
    value,
    lockedKey,
    inputType: config?.inputType ?? "text",
  };
}

function metadataToFields(metadata?: Record<string, unknown> | null) {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key]) => key !== productImageMetadataKey)
    .map(([key, value]) => {
      const config = metadataConfigForKey(key);

      return createMetadataField({
        key,
        value: stringifyMetadataValue(value),
        lockedKey: Boolean(config),
      });
    });
}

function metadataFieldsToObject(fields: MetadataField[]):
  | { ok: true; metadata?: Record<string, unknown> }
  | { ok: false; message: string } {
  const metadata: Record<string, unknown> = {};
  const usedKeys = new Set<string>();

  for (const field of fields) {
    const key = field.key.trim();
    const value = field.value.trim();

    if (!key && !value) {
      continue;
    }

    if (!key) {
      return {
        ok: false,
        message: "Ingresá el nombre del campo técnico.",
      };
    }

    if (key === productImageMetadataKey) {
      return {
        ok: false,
        message: "La imagen se configura en el campo principal de imagen.",
      };
    }

    if (usedKeys.has(key)) {
      return {
        ok: false,
        message: `Ya existe un campo técnico llamado "${key}".`,
      };
    }

    usedKeys.add(key);
    metadata[key] = value;
  }

  return {
    ok: true,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

export function CatalogManager() {
  const { canManage, isAdmin, scope, scopeKey, scopeLabel } = useAdminScope();
  const showMerchantColumn = isAdmin && scope.mode === "global";
  const catalogColumnCount = showMerchantColumn ? 9 : 8;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [merchantTarget, setMerchantTarget] = useState({
    scopeKey,
    value: "",
  });
  const targetMerchantId =
    merchantTarget.scopeKey === scopeKey ? merchantTarget.value : "";
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(
    null
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] =
    useState<ProductImportResponse | null>(null);
  const [importInputKey, setImportInputKey] = useState(0);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [viewingMetadataProduct, setViewingMetadataProduct] =
    useState<CatalogProduct | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [catalogPagination, setCatalogPagination] =
    useState<TablePaginationState>({
      page: 1,
      pageSize: DEFAULT_TABLE_PAGE_SIZE,
    });
  const hasOpenModal =
    isFormOpen || isImportModalOpen || viewingMetadataProduct !== null;
  const previewImageUrl = parseImageUrl(form.imageUrl);
  const isPreviewImageUrlValid = isSupportedImageUrl(previewImageUrl);
  const hasPreviewImage =
    Boolean(previewImageUrl) &&
    isPreviewImageUrlValid &&
    failedImageUrl !== previewImageUrl;

  const activeCount = useMemo(
    () =>
      products.filter(
        (product) => availabilityStatusForProduct(product) === "AVAILABLE"
      ).length,
    [products]
  );
  const displayProducts = useMemo(() => {
    if (!showMerchantColumn) return products;

    return [...products].sort((first, second) => {
      const merchantComparison = productMerchantName(first).localeCompare(
        productMerchantName(second),
        "es"
      );
      if (merchantComparison !== 0) return merchantComparison;

      const merchantKeyComparison = productMerchantKey(first).localeCompare(
        productMerchantKey(second),
        "es",
        { numeric: true }
      );
      if (merchantKeyComparison !== 0) return merchantKeyComparison;

      const firstNumber = catalogNumberValue(first) ?? Number.MAX_SAFE_INTEGER;
      const secondNumber = catalogNumberValue(second) ?? Number.MAX_SAFE_INTEGER;
      if (firstNumber !== secondNumber) return firstNumber - secondNumber;

      return first.name.localeCompare(second.name, "es");
    });
  }, [products, showMerchantColumn]);
  const catalogPage = useMemo(
    () => paginateRows(displayProducts, catalogPagination),
    [catalogPagination, displayProducts]
  );
  const advancedStatusLabel = form.metadata.length
    ? metadataCountLabel(form.metadata.length)
    : "Opcional";

  async function loadProducts(nextFilters = filters) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(buildProductsUrl(nextFilters), {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo cargar el catálogo.")
        );
      }

      const nextProducts = readProducts(payload);

      setProducts(nextProducts);
      setCatalogPagination((current) => {
        const nextPage = paginateRows(nextProducts, current).currentPage;

        return current.page === nextPage
          ? current
          : { ...current, page: nextPage };
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el catálogo."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialProducts() {
      setIsLoading(true);
      try {
        const response = await fetch(buildProductsUrl(initialFilters), {
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            messageFromPayload(payload, "No se pudo cargar el catálogo.")
          );
        }

        if (!ignore) {
          const nextProducts = readProducts(payload);

          setProducts(nextProducts);
          setCatalogPagination((current) => {
            const nextPage = paginateRows(nextProducts, current).currentPage;

            return current.page === nextPage
              ? current
              : { ...current, page: nextPage };
          });
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el catálogo."
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialProducts();

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

  function resetCatalogPage() {
    setCatalogPagination((current) =>
      current.page === 1 ? current : { ...current, page: 1 }
    );
  }

  function updateFilters(updates: Partial<CatalogFilters>) {
    resetCatalogPage();
    setFilters((current) => ({ ...current, ...updates }));
  }

  function updateForm<K extends keyof CatalogForm>(
    key: K,
    value: CatalogForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetImportState() {
    setImportFile(null);
    setImportResult(null);
    setImportInputKey((current) => current + 1);
  }

  function resetForm() {
    setEditingProduct(null);
    setForm(emptyForm);
    setMerchantTarget({ scopeKey, value: "" });
    setFailedImageUrl(null);
    setIsAdvancedOpen(false);
  }

  function openCreateForm() {
    resetForm();
    setViewingMetadataProduct(null);
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  function openEditForm(product: CatalogProduct) {
    setViewingMetadataProduct(null);
    setEditingProduct(product);
    setForm(productToForm(product));
    setFailedImageUrl(null);
    setIsAdvancedOpen(metadataEntries(product.metadata).length > 0);
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  function closeFormModal() {
    if (isSubmitting) return;
    if (!confirmFormClose()) return;

    resetForm();
    setError(null);
    setIsFormOpen(false);
  }

  function openImportModal() {
    resetImportState();
    setViewingMetadataProduct(null);
    setError(null);
    setSuccess(null);
    setIsImportModalOpen(true);
  }

  function closeImportModal() {
    if (isImporting) return;

    resetImportState();
    setError(null);
    setSuccess(null);
    setIsImportModalOpen(false);
  }

  function updateImportFile(file: File | null) {
    setImportFile(file);
    setImportResult(null);
    setError(null);
    setSuccess(null);
  }

  function addMetadataSuggestion(
    suggestion: (typeof metadataSuggestions)[number]
  ) {
    setIsAdvancedOpen(true);
    setForm((current) => {
      if (
        current.metadata.some((field) => field.key.trim() === suggestion.key)
      ) {
        return current;
      }

      return {
        ...current,
        metadata: [
          ...current.metadata,
          createMetadataField({
            key: suggestion.key,
            lockedKey: true,
          }),
        ],
      };
    });
  }

  function addCustomMetadataField() {
    setIsAdvancedOpen(true);
    setForm((current) => ({
      ...current,
      metadata: [...current.metadata, createMetadataField({})],
    }));
  }

  function updateMetadataField(
    id: string,
    updates: Partial<Pick<MetadataField, "key" | "value">>
  ) {
    setForm((current) => ({
      ...current,
      metadata: current.metadata.map((field) => {
        if (field.id !== id) {
          return field;
        }

        const nextKey = updates.key ?? field.key;
        const config = metadataConfigForKey(nextKey.trim());

        return {
          ...field,
          ...updates,
          inputType: config?.inputType ?? "text",
        };
      }),
    }));
  }

  function updateImageUrl(value: string) {
    updateForm("imageUrl", value);
    setFailedImageUrl(null);
  }

  function removeMetadataField(id: string) {
    setForm((current) => ({
      ...current,
      metadata: current.metadata.filter((field) => field.id !== id),
    }));
  }

  function openMetadataModal(product: CatalogProduct) {
    setViewingMetadataProduct(product);
  }

  function closeMetadataModal() {
    setViewingMetadataProduct(null);
  }

  function validateForm() {
    const name = form.name.trim();
    const price = normalizePrice(form.price);

    if (!name) {
      return "Ingresá el nombre del producto o servicio.";
    }

    if (!editingProduct && scope.mode === "global" && !targetMerchantId) {
      return "Seleccioná el comercio del nuevo producto.";
    }

    if (!Number.isFinite(price) || price < 0) {
      return "Ingresá un precio válido.";
    }

    if (!isSupportedImageUrl(form.imageUrl)) {
      return "Ingresá una URL de imagen válida.";
    }

    const metadataResult = metadataFieldsToObject(form.metadata);

    if (!metadataResult.ok) {
      return metadataResult.message;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isImporting) return;

    setError(null);
    setSuccess(null);

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const metadataResult = metadataFieldsToObject(form.metadata);
    const metadata = metadataResult.ok
      ? { ...(metadataResult.metadata ?? {}) }
      : {};
    const imageUrl = parseImageUrl(form.imageUrl);

    if (imageUrl) {
      metadata[productImageMetadataKey] = imageUrl;
    }

    const payload = {
      ...(!editingProduct && targetMerchantId
        ? { merchantId: targetMerchantId }
        : {}),
      type: form.type,
      sku: form.sku.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: normalizePrice(form.price),
      currency: form.currency.trim().toUpperCase() || "PYG",
      availabilityStatus: form.availabilityStatus,
      ...(Object.keys(metadata).length || editingProduct ? { metadata } : {}),
    };

    setIsSubmitting(true);

    try {
      const endpoint = editingProduct
        ? `/api/products/${encodeURIComponent(String(editingProduct.id))}`
        : "/api/products";
      const response = await fetch(endpoint, {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(
            responsePayload,
            editingProduct
              ? "No se pudo actualizar el producto."
              : "No se pudo crear el producto."
          )
        );
      }

      resetForm();
      setIsFormOpen(false);
      setSuccess(
        editingProduct
          ? "Producto actualizado correctamente."
          : "Producto creado correctamente."
      );
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el producto."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImportProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setError(null);
    setSuccess(null);
    setImportResult(null);

    if (!importFile) {
      setError("Seleccioná una plantilla .xlsx para importar.");
      return;
    }

    if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
      setError("Subí una plantilla .xlsx válida.");
      return;
    }

    const formData = new FormData();
    formData.set("file", importFile);
    setIsImporting(true);

    try {
      const response = await fetch("/api/products/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo importar el archivo.")
        );
      }

      const result = readProductImportResponse(payload);

      setImportResult(result);
      if (result.created > 0) {
        setSuccess(
          `Importación finalizada: ${result.created} creados, ${result.failed} fallidos.`
        );
      } else {
        setError(
          result.failed > 0
            ? "No se creó ningún producto. Revisá los errores detectados en el archivo."
            : "No se creó ningún producto desde el archivo."
        );
      }
      setImportFile(null);
      setImportInputKey((current) => current + 1);
      setFilters(initialFilters);
      resetCatalogPage();
      await loadProducts(initialFilters);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo importar el archivo."
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    await loadProducts(filters);
  }

  async function handleDelete(product: CatalogProduct) {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}" del catálogo de ${productMerchantName(product)}?`
    );

    if (!confirmed) return;

    setPendingProductId(String(product.id));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(String(product.id))}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          messageFromPayload(payload, "No se pudo eliminar el producto.")
        );
      }

      if (editingProduct?.id === product.id) {
        resetForm();
        setIsFormOpen(false);
      }

      if (viewingMetadataProduct?.id === product.id) {
        setViewingMetadataProduct(null);
      }

      setSuccess("Producto eliminado correctamente.");
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el producto."
      );
    } finally {
      setPendingProductId(null);
    }
  }

  async function handleAvailabilityStatus(
    product: CatalogProduct,
    availabilityStatus: ProductAvailabilityStatus
  ) {
    if (availabilityStatus === availabilityStatusForProduct(product)) return;

    setPendingProductId(String(product.id));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(String(product.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ availabilityStatus }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar la disponibilidad.")
        );
      }

      setSuccess(
        `Estado de ${product.name}: ${availabilityLabel(
          availabilityStatus
        ).toLowerCase()}.`
      );
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la disponibilidad."
      );
    } finally {
      setPendingProductId(null);
    }
  }

  return (
    <div className="catalog-layout">
      <section className="card card-lg catalog-table-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Tabla de catálogo</h2>
            <p className="muted">
              {products.length} ítems · {activeCount} activos
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              className="button-tonal"
              disabled={!canManage}
              onClick={openCreateForm}
              title={
                canManage
                  ? "Agregar producto"
                  : "Seleccioná un comercio para agregar productos"
              }
              type="button"
            >
              <PackagePlus size={17} />
              Agregar
            </button>
            <button
              className="button-secondary"
              disabled={!canManage || scope.mode === "global"}
              onClick={openImportModal}
              title={
                scope.mode === "global"
                  ? "La importación masiva requiere seleccionar un comercio en el alcance superior"
                  : canManage
                    ? "Importar catálogo"
                    : "No tenés permiso para importar productos"
              }
              type="button"
            >
              <FileSpreadsheet size={17} />
              Importar
            </button>
            <button
              className="icon-button"
              disabled={isLoading}
              onClick={() => void loadProducts()}
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

        <section
          aria-label="Comportamiento de los estados del catálogo"
          className="catalog-state-guide"
        >
          <div className="catalog-state-guide-header">
            <strong>Qué significa cada estado</strong>
            <span>
              Solo los ítems activos pueden agregarse al carrito y confirmarse.
            </span>
          </div>
          <div className="catalog-state-guide-grid">
            {availabilityOptions.map((option) => (
              <article className="catalog-state-guide-item" key={option.value}>
                <span
                  className={`catalog-state-label status-${option.value.toLowerCase()}`}
                >
                  {option.label}
                </span>
                <span>{option.description}</span>
              </article>
            ))}
          </div>
        </section>

        <form className="catalog-filters" onSubmit={handleFilterSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="catalog-search">
              Buscar
            </label>
            <input
              className="field-control"
              id="catalog-search"
              placeholder="Buscar por nombre o código SKU"
              value={filters.q}
              onChange={(event) => updateFilters({ q: event.target.value })}
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="catalog-filter-type">
              Tipo
            </label>
            <select
              className="field-control"
              id="catalog-filter-type"
              value={filters.type}
              onChange={(event) =>
                updateFilters({
                  type: event.target.value as ProductTypeFilter,
                })
              }
            >
              <option value="ALL">Todos</option>
              <option value="PRODUCT">Productos</option>
              <option value="SERVICE">Servicios</option>
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="catalog-filter-available">
              Estado
            </label>
            <select
              className="field-control"
              id="catalog-filter-available"
              value={filters.availabilityStatus}
              onChange={(event) =>
                updateFilters({
                  availabilityStatus: event.target.value as AvailabilityFilter,
                })
              }
            >
              <option value="ALL">Todos</option>
              {availabilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
          <table
            className={`data-table catalog-data-table${
              showMerchantColumn ? " is-global-catalog" : ""
            }`}
          >
            <thead>
              <tr>
                <th className="catalog-number-column">N.º catálogo</th>
                <th className="catalog-product-primary-column">Producto</th>
                <th className="catalog-price-column">Precio</th>
                <th className="catalog-status-column">Estado</th>
                {showMerchantColumn ? <th>Comercio</th> : null}
                <th className="catalog-secondary-column">Código SKU</th>
                <th className="catalog-secondary-column">Tipo</th>
                <th className="catalog-secondary-column">Campos avanzados</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={catalogColumnCount}>
                      <span className="skeleton table-skeleton" />
                    </td>
                  </tr>
                ))
              ) : products.length ? (
                catalogPage.rows.map((product, index) => {
                  const isPending = pendingProductId === String(product.id);
                  const metadata = metadataEntries(product.metadata);
                  const previousProduct = catalogPage.rows[index - 1];
                  const startsMerchantGroup =
                    showMerchantColumn &&
                    (!previousProduct ||
                      productMerchantKey(previousProduct) !==
                        productMerchantKey(product));

                  return (
                    <Fragment key={product.id}>
                      {startsMerchantGroup ? (
                        <tr className="catalog-merchant-group-row">
                          <td colSpan={catalogColumnCount}>
                            <span className="catalog-merchant-group-label">
                              <Store aria-hidden="true" size={15} />
                              <strong>{productMerchantName(product)}</strong>
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="catalog-number-cell">
                          <span className="catalog-number">
                            {formatCatalogNumber(product)}
                          </span>
                        </td>
                        <td className="catalog-product-primary-cell">
                          <div className="catalog-product-cell">
                            <CatalogThumbnail product={product} />
                            <span className="catalog-product-copy">
                              <strong>{product.name}</strong>
                              {product.description ? (
                                <span className="table-muted">
                                  {product.description}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="catalog-price-cell">
                          <strong>{formatPrice(product.price, product.currency)}</strong>
                        </td>
                        <td className="catalog-status-column">
                          <select
                            aria-label={`Estado de ${product.name}`}
                            className={`catalog-status-select status-${availabilityStatusForProduct(
                              product
                            ).toLowerCase()}`}
                            disabled={isPending || !canManage}
                            title={
                              availabilityOptions.find(
                                (option) =>
                                  option.value ===
                                  availabilityStatusForProduct(product)
                              )?.description
                            }
                            value={availabilityStatusForProduct(product)}
                            onChange={(event) =>
                              void handleAvailabilityStatus(
                                product,
                                event.target.value as ProductAvailabilityStatus
                              )
                            }
                          >
                            {availabilityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        {showMerchantColumn ? (
                          <td>
                            <strong>{productMerchantName(product)}</strong>
                            <span className="table-muted">
                              Comercio #{product.merchant?.id ?? product.merchantId ?? "-"}
                            </span>
                          </td>
                        ) : null}
                        <td className="catalog-secondary-column">
                          <span className="catalog-sku-code">
                            {product.sku || "Sin código SKU"}
                          </span>
                        </td>
                        <td className="catalog-secondary-column">
                          <span className="pill">
                            {product.type === "SERVICE" ? "Servicio" : "Producto"}
                          </span>
                        </td>
                        <td className="catalog-secondary-column">
                          {metadata.length ? (
                            <button
                              aria-label={`Ver ${metadataCountLabel(
                                metadata.length
                              )} técnicos de ${product.name}`}
                              className="metadata-trigger"
                              onClick={() => openMetadataModal(product)}
                              type="button"
                            >
                              <Braces aria-hidden="true" size={15} />
                              <span>{metadataCountLabel(metadata.length)}</span>
                            </button>
                          ) : (
                            <span className="table-muted">Sin campos</span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="icon-button"
                              disabled={isPending || !canManage}
                              onClick={() => openEditForm(product)}
                              title={canManage ? "Editar" : "Seleccioná un comercio para editar"}
                              type="button"
                            >
                              <Edit3 size={17} />
                            </button>
                            <button
                              className="icon-button danger-button"
                              disabled={isPending || !canManage}
                              onClick={() => void handleDelete(product)}
                              title={canManage ? "Eliminar" : "Seleccioná un comercio para eliminar"}
                              type="button"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={catalogColumnCount}>
                    <div className="empty-table-state">
                      <PackagePlus aria-hidden="true" size={26} />
                      <strong>Sin ítems en el catálogo</strong>
                      <span>Creá un producto o ajustá los filtros.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={catalogPage.currentPage}
          itemLabelPlural="ítems"
          itemLabelSingular="ítem"
          pageSize={catalogPage.pageSize}
          totalItems={catalogPage.totalItems}
          totalPages={catalogPage.totalPages}
          onPageChange={(page) =>
            setCatalogPagination((current) => ({ ...current, page }))
          }
          onPageSizeChange={(pageSize) =>
            setCatalogPagination({ page: 1, pageSize })
          }
        />
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
            aria-label={editingProduct ? "Editar ítem" : "Nuevo ítem"}
            aria-modal="true"
            className="card card-lg catalog-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {editingProduct ? "Editar ítem" : "Nuevo ítem"}
                </h2>
                <p className="muted">
                  Producto o servicio visible en el catálogo de {scopeLabel}.
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
              {!editingProduct ? (
                <AdminMerchantTargetField
                  disabled={isSubmitting}
                  id="catalog-target-merchant"
                  value={targetMerchantId}
                  onChange={(value) => setMerchantTarget({ scopeKey, value })}
                />
              ) : null}

              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="catalog-type">
                    Tipo
                  </label>
                  <select
                    className="field-control"
                    disabled={isSubmitting || Boolean(editingProduct)}
                    id="catalog-type"
                    value={form.type}
                    onChange={(event) =>
                      updateForm("type", event.target.value as ProductType)
                    }
                  >
                    <option value="PRODUCT">Producto</option>
                    <option value="SERVICE">Servicio</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="catalog-sku">
                    Código SKU (opcional)
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="catalog-sku"
                    placeholder="Se genera automáticamente"
                    value={form.sku}
                    onChange={(event) => updateForm("sku", event.target.value)}
                  />
                  <span className="field-hint">
                    Si queda vacío, se asignará un código SKU único.
                  </span>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="catalog-name">
                  Nombre
                </label>
                <input
                  className="field-control"
                  disabled={isSubmitting}
                  id="catalog-name"
                  placeholder="Milanesa napolitana"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="catalog-description">
                  Descripción
                </label>
                <textarea
                  className="field-control textarea-control"
                  disabled={isSubmitting}
                  id="catalog-description"
                  placeholder="Detalle breve para clientes"
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                />
              </div>

              <div className="catalog-product-image-field">
                <div
                  className={
                    hasPreviewImage
                      ? "catalog-product-image-preview has-image"
                      : "catalog-product-image-preview"
                  }
                >
                  {hasPreviewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Previsualización del producto"
                      referrerPolicy="no-referrer"
                      src={previewImageUrl}
                      onError={() => setFailedImageUrl(previewImageUrl)}
                    />
                  ) : (
                    <ImageIcon aria-hidden="true" size={24} />
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="catalog-image-url">
                    Imagen del producto
                  </label>
                  <input
                    aria-describedby="catalog-image-url-hint"
                    aria-invalid={Boolean(
                      previewImageUrl && !isPreviewImageUrlValid
                    )}
                    autoComplete="url"
                    className="field-control"
                    disabled={isSubmitting}
                    id="catalog-image-url"
                    inputMode="url"
                    placeholder="https://ejemplo.com/producto.jpg"
                    value={form.imageUrl}
                    onChange={(event) => updateImageUrl(event.target.value)}
                  />
                  <span
                    className={
                      previewImageUrl && !isPreviewImageUrlValid
                        ? "field-hint field-hint-error"
                        : "field-hint"
                    }
                    id="catalog-image-url-hint"
                  >
                    {!previewImageUrl
                      ? "Pegá la URL pública de la imagen para previsualizarla."
                      : !isPreviewImageUrlValid
                        ? "Ingresá una URL que comience con http:// o https://."
                        : failedImageUrl === previewImageUrl
                          ? "La URL es válida, pero no se pudo cargar la imagen."
                          : "Previsualización de la imagen que verá el cliente."}
                  </span>
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="catalog-price">
                    Precio
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="catalog-price"
                    inputMode="decimal"
                    min="0"
                    placeholder="45000"
                    type="number"
                    value={form.price}
                    onChange={(event) => updateForm("price", event.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="catalog-currency">
                    Moneda
                  </label>
                  <input
                    className="field-control"
                    disabled
                    id="catalog-currency"
                    maxLength={3}
                    placeholder="PYG"
                    value={form.currency}
                    onChange={(event) =>
                      updateForm("currency", event.target.value.toUpperCase())
                    }
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="catalog-availability-status">
                  Disponibilidad
                </label>
                <select
                  className="field-control"
                  disabled={isSubmitting}
                  id="catalog-availability-status"
                  value={form.availabilityStatus}
                  onChange={(event) =>
                    updateForm(
                      "availabilityStatus",
                      event.target.value as ProductAvailabilityStatus
                    )
                  }
                >
                  {availabilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  {
                    availabilityOptions.find(
                      (option) => option.value === form.availabilityStatus
                    )?.description
                  }
                </span>
              </div>

              <details
                className="advanced-section"
                open={isAdvancedOpen}
                onToggle={(event) =>
                  setIsAdvancedOpen(event.currentTarget.open)
                }
              >
                <summary>
                  <span>
                    <strong>Configuración avanzada</strong>
                    <span>
                      Categoría y campos técnicos del ítem.
                    </span>
                  </span>
                  <span className="pill">
                    {advancedStatusLabel}
                  </span>
                </summary>

                <div className="advanced-section-content">
                  <div className="field-label-row">
                    <span className="field-label">Campos técnicos</span>
                    <div
                      className="metadata-suggestions"
                      aria-label="Sugerencias de campos técnicos"
                    >
                      {metadataSuggestions.map((suggestion) => (
                        <button
                          className="suggestion-chip"
                          disabled={isSubmitting}
                          key={suggestion.key}
                          onClick={() => addMetadataSuggestion(suggestion)}
                          type="button"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                      <button
                        className="suggestion-chip custom-chip"
                        disabled={isSubmitting}
                        onClick={addCustomMetadataField}
                        type="button"
                      >
                        Campo personalizado
                      </button>
                    </div>
                  </div>
                  {form.metadata.length ? (
                    <div className="metadata-field-list">
                      {form.metadata.map((field) => (
                        <div className="metadata-field-row" key={field.id}>
                          {field.lockedKey ? (
                            <span className="metadata-key-pill">
                              {metadataLabelForKey(field.key)}
                            </span>
                          ) : (
                            <input
                              aria-label="Clave del campo técnico"
                              className="field-control metadata-key-control"
                              disabled={isSubmitting}
                              placeholder="campoCustom"
                              value={field.key}
                              onChange={(event) =>
                                updateMetadataField(field.id, {
                                  key: event.target.value,
                                })
                              }
                            />
                          )}

                          {field.inputType === "select" ? (
                            <select
                              aria-label={`Valor de ${
                                metadataLabelForKey(field.key) || "campo técnico"
                              }`}
                              className="field-control metadata-value-control"
                              disabled={isSubmitting}
                              value={field.value}
                              onChange={(event) =>
                                updateMetadataField(field.id, {
                                  value: event.target.value,
                                })
                              }
                            >
                              {field.value &&
                              !serviceModeOptions.some(
                                (option) => option.value === field.value
                              ) ? (
                                <option value={field.value}>{field.value}</option>
                              ) : null}
                              {serviceModeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`Valor de ${
                                metadataLabelForKey(field.key) || "campo técnico"
                              }`}
                              className="field-control metadata-value-control"
                              disabled={isSubmitting}
                              placeholder="Valor"
                              type={field.inputType === "url" ? "url" : "text"}
                              value={field.value}
                              onChange={(event) =>
                                updateMetadataField(field.id, {
                                  value: event.target.value,
                                })
                              }
                            />
                          )}

                          <button
                            aria-label={`Eliminar ${
                              metadataLabelForKey(field.key) || "campo técnico"
                            }`}
                            className="icon-button danger-button metadata-remove"
                            disabled={isSubmitting}
                            onClick={() => removeMetadataField(field.id)}
                            type="button"
                          >
                            <X size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="metadata-empty-state">
                      Agregá estos campos solo si necesitás datos extra para el
                      catálogo.
                    </div>
                  )}
                </div>
              </details>

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
                      {editingProduct ? "Actualizar" : "Guardar"}
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

      {isImportModalOpen ? (
        <div className="catalog-modal-layer" role="presentation">
          <button
            aria-label="Cerrar importación"
            className="catalog-modal-backdrop"
            disabled={isImporting}
            onClick={closeImportModal}
            type="button"
          />
          <section
            aria-label="Importar productos"
            aria-modal="true"
            className="card card-lg catalog-modal catalog-import-modal"
            role="dialog"
          >
            <div className="card-header">
              <div>
                <h2 className="card-title">Importar productos</h2>
                <p className="muted">
                  Cargá varios productos de una vez mediante una plantilla
                  Excel.
                </p>
              </div>
              <button
                className="icon-button"
                disabled={isImporting}
                onClick={closeImportModal}
                title="Cerrar importación"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <form className="catalog-form" onSubmit={handleImportProducts}>
              <div className="catalog-import-panel">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="catalog-import-file">
                    Archivo de productos
                  </label>
                  <span className="pill">.xlsx</span>
                </div>

                <input
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="catalog-import-input"
                  disabled={isImporting}
                  id="catalog-import-file"
                  key={importInputKey}
                  type="file"
                  onChange={(event) =>
                    updateImportFile(event.target.files?.[0] ?? null)
                  }
                />
                <label
                  className={
                    importFile
                      ? "catalog-import-file has-file"
                      : "catalog-import-file"
                  }
                  htmlFor="catalog-import-file"
                >
                  <FileSpreadsheet aria-hidden="true" size={20} />
                  <span>
                    <strong>
                      {importFile?.name ?? "Seleccionar archivo Excel"}
                    </strong>
                    <span>
                      La plantilla incluye imagen, categoría y modo de servicio.
                    </span>
                  </span>
                </label>

                <span className="field-hint">
                  Descargá la plantilla, completala y seleccioná el archivo para
                  iniciar la importación.
                </span>
              </div>

              {error ? (
                <div className="error-box" role="alert">
                  <CircleAlert aria-hidden="true" size={18} />
                  <span>{error}</span>
                </div>
              ) : null}

              {success ? (
                <div className="success-box" role="status">
                  <CircleCheck aria-hidden="true" size={18} />
                  <span>{success}</span>
                </div>
              ) : null}

              {importResult ? (
                <div
                  className={
                    importResult.failed
                      ? "catalog-import-result has-errors"
                      : "catalog-import-result"
                  }
                  role="status"
                >
                  <div className="catalog-import-stats">
                    <span>
                      <strong>{importResult.processed}</strong>
                      <span>Procesados</span>
                    </span>
                    <span>
                      <strong>{importResult.created}</strong>
                      <span>Creados</span>
                    </span>
                    <span>
                      <strong>{importResult.failed}</strong>
                      <span>Fallidos</span>
                    </span>
                  </div>

                  {importResult.errors.length ? (
                    <ul className="catalog-import-errors">
                      {importResult.errors.slice(0, 5).map((item, index) => {
                        const message = formatImportError(item, index);

                        return <li key={`${message}-${index}`}>{message}</li>;
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="catalog-import-actions">
                <a
                  className="button-secondary"
                  download="plantilla-productos.xlsx"
                  href="/api/products/import/template"
                >
                  <Download size={17} />
                  Descargar plantilla
                </a>
                <button
                  className="button-primary"
                  disabled={!importFile || isImporting}
                  type="submit"
                >
                  {isImporting ? (
                    <>
                      <span aria-hidden="true" className="spinner" />
                      Importando
                    </>
                  ) : (
                    <>
                      <Upload size={17} />
                      Importar archivo
                    </>
                  )}
                </button>
                <button
                  className="button-secondary"
                  disabled={isImporting}
                  onClick={closeImportModal}
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

      {viewingMetadataProduct ? (
        <CatalogMetadataModal
          product={viewingMetadataProduct}
          onClose={closeMetadataModal}
        />
      ) : null}
    </div>
  );
}
