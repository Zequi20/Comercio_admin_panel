"use client";

import {
  Braces,
  CircleAlert,
  CircleCheck,
  Edit3,
  Package,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type ProductType = "PRODUCT" | "SERVICE";
type AvailabilityFilter = "ALL" | "true" | "false";
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
  type?: ProductType;
  sku?: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency: string;
  available: boolean;
  metadata?: Record<string, unknown> | null;
};

type ListProductsResponse = {
  data?: CatalogProduct[];
};

type CatalogForm = {
  type: ProductType;
  sku: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  available: boolean;
  metadata: MetadataField[];
};

type CatalogFilters = {
  q: string;
  type: ProductTypeFilter;
  available: AvailabilityFilter;
};

const emptyForm: CatalogForm = {
  type: "PRODUCT",
  sku: "",
  name: "",
  description: "",
  price: "",
  currency: "PYG",
  available: true,
  metadata: [],
};

const initialFilters: CatalogFilters = {
  q: "",
  type: "ALL",
  available: "ALL",
};

const metadataSuggestions = [
  { key: "imageUrl", label: "Imagen", inputType: "url" },
  { key: "category", label: "Categoría", inputType: "text" },
  { key: "serviceMode", label: "Modo de servicio", inputType: "select" },
] as const;

const serviceModeOptions = [
  { value: "", label: "Seleccionar" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICKUP", label: "Retiro" },
  { value: "DELIVERY_PICKUP", label: "Delivery y retiro" },
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
    price: String(product.price ?? ""),
    currency: product.currency || "PYG",
    available: product.available,
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

  if (filters.available !== "ALL") {
    params.set("available", filters.available);
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

function metadataEntries(metadata?: Record<string, unknown> | null) {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata).filter(([, value]) => {
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

function metadataImageUrl(metadata?: Record<string, unknown> | null) {
  const value = metadata?.imageUrl;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }

  return null;
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

  return Object.entries(metadata).map(([key, value]) => {
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
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(
    null
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [viewingMetadataProduct, setViewingMetadataProduct] =
    useState<CatalogProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const hasOpenModal = isFormOpen || viewingMetadataProduct !== null;

  const activeCount = useMemo(
    () => products.filter((product) => product.available).length,
    [products]
  );

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

      setProducts(readProducts(payload));
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
          setProducts(readProducts(payload));
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
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", hasOpenModal);

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [hasOpenModal]);

  function updateForm<K extends keyof CatalogForm>(
    key: K,
    value: CatalogForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingProduct(null);
    setForm(emptyForm);
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
    setIsAdvancedOpen(metadataEntries(product.metadata).length > 0);
    setError(null);
    setSuccess(null);
    setIsFormOpen(true);
  }

  function closeFormModal() {
    if (isSubmitting) return;
    resetForm();
    setError(null);
    setIsFormOpen(false);
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

    if (!Number.isFinite(price) || price < 0) {
      return "Ingresá un precio válido.";
    }

    const metadataResult = metadataFieldsToObject(form.metadata);

    if (!metadataResult.ok) {
      return metadataResult.message;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const metadataResult = metadataFieldsToObject(form.metadata);

    const payload = {
      type: form.type,
      sku: form.sku.trim() || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: normalizePrice(form.price),
      currency: form.currency.trim().toUpperCase() || "PYG",
      available: form.available,
      ...(metadataResult.ok &&
      (metadataResult.metadata || (editingProduct && !form.metadata.length))
        ? { metadata: metadataResult.metadata ?? {} }
        : {}),
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

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    await loadProducts(filters);
  }

  async function handleDelete(product: CatalogProduct) {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}" del catálogo?`
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

  async function handleAvailability(product: CatalogProduct) {
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
          body: JSON.stringify({ available: !product.available }),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "No se pudo actualizar la disponibilidad.")
        );
      }

      setSuccess("Disponibilidad actualizada.");
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
              onClick={openCreateForm}
              type="button"
            >
              <PackagePlus size={17} />
              Agregar
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

        <form className="catalog-filters" onSubmit={handleFilterSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="catalog-search">
              Buscar
            </label>
            <input
              className="field-control"
              id="catalog-search"
              placeholder="Nombre o SKU"
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
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
                setFilters((current) => ({
                  ...current,
                  type: event.target.value as ProductTypeFilter,
                }))
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
              value={filters.available}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  available: event.target.value as AvailabilityFilter,
                }))
              }
            >
              <option value="ALL">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Pausados</option>
            </select>
          </div>
          <button className="button-tonal" disabled={isLoading} type="submit">
            <Search size={17} />
            Filtrar
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table catalog-data-table">
            <thead>
              <tr>
                <th>Imagen</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>SKU</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Detalles</th>
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
              ) : products.length ? (
                products.map((product) => {
                  const isPending = pendingProductId === String(product.id);
                  const metadata = metadataEntries(product.metadata);

                  return (
                    <tr key={product.id}>
                      <td>
                        <CatalogThumbnail product={product} />
                      </td>
                      <td>
                        <strong>{product.name}</strong>
                        {product.description ? (
                          <span className="table-muted">
                            {product.description}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span className="pill">
                          {product.type === "SERVICE" ? "Servicio" : "Producto"}
                        </span>
                      </td>
                      <td>{product.sku || "Sin SKU"}</td>
                      <td>{formatPrice(product.price, product.currency)}</td>
                      <td>
                        <button
                          className={
                            product.available
                              ? "status-toggle active"
                              : "status-toggle"
                          }
                          disabled={isPending}
                          onClick={() => void handleAvailability(product)}
                          type="button"
                        >
                          {product.available ? "Activo" : "Pausado"}
                        </button>
                      </td>
                      <td>
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
                          <span className="table-muted">Sin detalles</span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-button"
                            disabled={isPending}
                            onClick={() => openEditForm(product)}
                            title="Editar"
                            type="button"
                          >
                            <Edit3 size={17} />
                          </button>
                          <button
                            className="icon-button danger-button"
                            disabled={isPending}
                            onClick={() => void handleDelete(product)}
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
                  Producto o servicio visible en el catálogo.
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
                    SKU
                  </label>
                  <input
                    className="field-control"
                    disabled={isSubmitting}
                    id="catalog-sku"
                    placeholder="SKU-001"
                    value={form.sku}
                    onChange={(event) => updateForm("sku", event.target.value)}
                  />
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

              <label className="toggle-row" htmlFor="catalog-available">
                <span>
                  <strong>Disponible</strong>
                  <span>Se muestra para venta cuando está activo.</span>
                </span>
                <input
                  checked={form.available}
                  disabled={isSubmitting}
                  id="catalog-available"
                  type="checkbox"
                  onChange={(event) =>
                    updateForm("available", event.target.checked)
                  }
                />
              </label>

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
                      Imagen externa, categoría y campos técnicos del ítem.
                    </span>
                  </span>
                  <span className="pill">
                    {form.metadata.length
                      ? metadataCountLabel(form.metadata.length)
                      : "Opcional"}
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

      {viewingMetadataProduct ? (
        <CatalogMetadataModal
          product={viewingMetadataProduct}
          onClose={closeMetadataModal}
        />
      ) : null}
    </div>
  );
}
